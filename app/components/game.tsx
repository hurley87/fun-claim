'use client';
import { useState } from 'react';
import {
  Connector,
  useAccount,
  useConnect,
  useReadContract,
  useWalletClient,
  useBalance,
} from 'wagmi';
import {
  encodeFunctionData,
  Hex,
  parseEther,
  toFunctionSelector,
  formatEther,
} from 'viem';
import {
  useCallsStatus,
  useGrantPermissions,
  useSendCalls,
} from 'wagmi/experimental';
import {
  createCredential,
  P256Credential,
  signWithCredential,
} from 'webauthn-p256';
import { mintAbi, mintAddress } from '@/lib/mint';
import Letters from './letters';
import { Button } from '@/components/ui/button';

export default function Game() {
  const [permissionsContext, setPermissionsContext] = useState<
    Hex | undefined
  >();
  const [credential, setCredential] = useState<
    undefined | P256Credential<'cryptokey'>
  >();
  const [callsId, setCallsId] = useState<string>();
  const [isBuying, setIsBuying] = useState(false);
  const [isGranting, setIsGranting] = useState(false);
  const account = useAccount();
  const address = account.address;
  const { connectors, connect } = useConnect();
  const { grantPermissionsAsync } = useGrantPermissions();
  const { data: walletClient } = useWalletClient({ chainId: 84532 });
  const { sendCallsAsync } = useSendCalls();
  const { data: callsStatus } = useCallsStatus({
    id: callsId as string,
    query: {
      enabled: !!callsId,
      refetchInterval: (data) =>
        data.state.data?.status === 'PENDING' ? 500 : false,
    },
  });
  const { data: hasClaimedFreeTokens, isLoading: hasClaimedFreeTokensLoading } =
    useReadContract({
      address: mintAddress,
      abi: mintAbi,
      functionName: 'hasClaimedFreeTokens',
      args: [address],
    });

  const ethBalance = useBalance({
    address: address,
  });

  const funBalance = useBalance({
    address: address,
    token: '0x0ea1113fd40f0abd399eea1472d2d9b6ab953298',
  });

  const contractFunBalance = useBalance({
    address: mintAddress,
    token: '0x0ea1113fd40f0abd399eea1472d2d9b6ab953298',
  });

  const connector = connectors.find(
    (c) => c.type === 'coinbaseWallet'
  ) as Connector;

  const login = async () => {
    connect({ connector });
  };

  console.log('account', address);
  console.log('hasClaimedFreeTokens', hasClaimedFreeTokens);
  console.log('hasClaimedFreeTokensLoading', hasClaimedFreeTokensLoading);

  console.log('funBalance', funBalance.data?.value);

  const balance = formatEther(ethBalance.data?.value ?? BigInt(0));

  console.log('balance', balance);

  const funTokens = formatEther(funBalance.data?.value ?? BigInt(0));

  console.log('funTokens', funTokens);

  const contractFunTokens = formatEther(
    contractFunBalance.data?.value ?? BigInt(0)
  );

  console.log('contractFunTokens', contractFunTokens);

  const grantPermissions = async () => {
    if (address) {
      setIsGranting(true);
      const newCredential = await createCredential({ type: 'cryptoKey' });
      const response = await grantPermissionsAsync({
        permissions: [
          {
            address: address,
            chainId: 84532,
            expiry: 17218875770,
            signer: {
              type: 'key',
              data: {
                type: 'secp256r1',
                publicKey: newCredential.publicKey,
              },
            },
            permissions: [
              {
                type: 'native-token-recurring-allowance',
                data: {
                  allowance: parseEther('0.1'),
                  start: Math.floor(Date.now() / 1000),
                  period: 86400,
                },
              },
              {
                type: 'allowed-contract-selector',
                data: {
                  contract: mintAddress,
                  selector: toFunctionSelector(
                    'permissionedCall(bytes calldata call)'
                  ),
                },
              },
            ],
          },
        ],
      });
      const context = response[0].context as Hex;
      setPermissionsContext(context);
      setCredential(newCredential);
      setIsGranting(false);
    }
  };

  const mintLetters = async () => {
    if (address && permissionsContext && credential && walletClient) {
      setIsBuying(true);
      const url = process.env.NEXT_PUBLIC_PAYMASTER_URL;
      const value = hasClaimedFreeTokens ? parseEther('0.01') : parseEther('0');

      try {
        const callsId = await sendCallsAsync({
          calls: [
            {
              to: mintAddress,
              value,
              data: encodeFunctionData({
                abi: mintAbi,
                functionName: 'mintTen',
                args: [],
              }),
            },
          ],
          capabilities: {
            permissions: {
              context: permissionsContext,
            },
            paymasterService: {
              url,
            },
          },
          signatureOverride: signWithCredential(credential),
        });

        console.log('callsId', callsId);

        setCallsId(callsId);
      } catch (e: unknown) {
        console.error('Error in sendCallsAsync:');
        console.log(e);
      }
      setIsBuying(false);
    }
  };

  console.log('credential', credential);

  return (
    <div>
      <div className="flex flex-col gap-4">
        {address && <div>{address}</div>}
        {address && <div>ETH Balance: {balance}</div>}
        {address && <div>FUN Balance: {funTokens}</div>}
        {address && <div>Contract FUN Balance: {contractFunTokens}</div>}
        {!address && <Button onClick={login}>Log in</Button>}
      </div>
      <div>
        {address &&
          (permissionsContext ? (
            <>
              <Button
                onClick={mintLetters}
                disabled={
                  isBuying ||
                  (!!callsId && !(callsStatus?.status === 'CONFIRMED'))
                }
              >
                Mint Letters
              </Button>
            </>
          ) : (
            <Button onClick={grantPermissions} disabled={isGranting}>
              Grant Permission
            </Button>
          ))}
        {callsStatus && callsStatus.status === 'CONFIRMED' && (
          <a
            href={`https://base-sepolia.blockscout.com/tx/${callsStatus.receipts?.[0].transactionHash}`}
            target="_blank"
            className="absolute top-8 hover:underline"
          >
            View transaction
          </a>
        )}
      </div>
      {address && credential && (
        <Letters
          address={address}
          credential={credential}
          permissionsContext={permissionsContext as Hex}
        />
      )}
    </div>
  );
}
