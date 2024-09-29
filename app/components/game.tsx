'use client';
import { useState } from 'react';
import { Connector, useAccount, useConnect, useWalletClient } from 'wagmi';
import { encodeFunctionData, Hex, parseEther, toFunctionSelector } from 'viem';
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

  const connector = connectors.find(
    (c) => c.type === 'coinbaseWallet'
  ) as Connector;

  console.log('connector', connector);

  const login = async () => {
    connect({ connector });
  };

  console.log('account', account.address);

  const grantPermissions = async () => {
    if (account.address) {
      setIsGranting(true);
      const newCredential = await createCredential({ type: 'cryptoKey' });
      const response = await grantPermissionsAsync({
        permissions: [
          {
            address: account.address,
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
    if (account.address && permissionsContext && credential && walletClient) {
      setIsBuying(true);
      const url = process.env.NEXT_PUBLIC_PAYMASTER_URL;

      try {
        const callsId = await sendCallsAsync({
          calls: [
            {
              to: mintAddress,
              data: encodeFunctionData({
                abi: mintAbi,
                functionName: 'mintSVG',
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
        if (e instanceof Error) {
          console.error(e.message);
          console.error(e.stack);
        } else {
          console.error(String(e));
        }
        if (e && typeof e === 'object' && 'response' in e) {
          console.error('Raw response:', e.response);
        }
      }
      setIsBuying(false);
    }
  };

  const address = account.address;

  return (
    <div>
      <div className="flex flex-col gap-4">
        {account.address && <div>{account.address}</div>}
        {/* {!balances && <div>Mint allowance: {Number(mintAllowance)}</div>} */}
        {!account.address && (
          <button onClick={login} type="button">
            Log in
          </button>
        )}
      </div>
      <div>
        {account.address &&
          (permissionsContext ? (
            <>
              <button
                type="button"
                onClick={mintLetters}
                disabled={
                  isBuying ||
                  (!!callsId && !(callsStatus?.status === 'CONFIRMED'))
                }
              >
                Mint Letters
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={grantPermissions}
              disabled={isGranting}
            >
              Grant Permission
            </button>
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
      {address && <Letters address={address} />}
    </div>
  );
}
