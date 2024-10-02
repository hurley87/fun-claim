'use client';
import { mintAbi, mintAddress } from '@/lib/mint';
import { useReadContract, useWatchContractEvent } from 'wagmi';
import { words } from '@/lib/dictionary';
import { useEffect, useState } from 'react';
import { encodeFunctionData, formatEther, Hex } from 'viem';
import { CryptoKeyP256Credential } from 'webauthn-p256/_types/types';
import { signWithCredential } from 'webauthn-p256';
import { useSendCalls } from 'wagmi/experimental';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export default function Letters({
  address,
  credential,
  permissionsContext,
}: {
  address: string;
  credential: CryptoKeyP256Credential;
  permissionsContext: Hex;
}) {
  const accounts = Array.from({ length: 26 }, () => address);
  const ids = Array.from({ length: 26 }, (_, i) => i);
  const [word, setWord] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { sendCallsAsync } = useSendCalls();

  const { data: balances, isLoading: balancesLoading } = useReadContract({
    address: mintAddress,
    abi: mintAbi,
    functionName: 'balanceOfBatch',
    args: [accounts, ids],
  });

  const [letters, setLetters] = useState<{ letter: string; balance: string }[]>(
    []
  );

  useEffect(() => {
    const letters = Array.isArray(balances)
      ? balances.map((_, index) => ({
          letter: String.fromCharCode(65 + index),
          balance: balances[index + 1]?.toString() ?? '0',
        }))
      : [];

    setLetters(letters);
  }, [balances]);

  // MintRequested(msg.sender, isFreeClaim);
  useWatchContractEvent({
    address: mintAddress,
    abi: mintAbi,
    eventName: 'MintRequested',
    onLogs(logs) {
      console.log('MintRequested', logs);

      setIsSubmitting(false);
    },
  });

  // RandomnessFulfilled(recipient, ids, amounts);
  useWatchContractEvent({
    address: mintAddress,
    abi: mintAbi,
    eventName: 'RandomnessFulfilled',
    onLogs(logs) {
      console.log('RandomnessFulfilled', logs);
      const log = logs[0] as {
        args?: { recipient?: string; ids?: number[]; amounts?: number[] };
      };
      const recipient = log.args?.recipient;
      const ids = log.args?.ids?.map((id) => Number(id));

      console.log('recipient', recipient);
      console.log('ids', ids);
      console.log('letters', letters);

      if (recipient === address) {
        const updatedLetters = letters.map((letter, index) => {
          console.log('index', index);
          const count = ids?.filter((id) => id === index + 1).length || 0;
          console.log('count', count);
          if (count > 0) {
            return {
              ...letter,
              balance: (Number(letter.balance) + count).toString(),
            };
          }
          return letter;
        });

        console.log('updatedLetters', updatedLetters);

        setLetters(updatedLetters);

        toast.success('Letters minted successfully');
        setIsSubmitting(false);
      }
    },
  });

  // TokensBurnedAndRedeemed(msg.sender, word, ids, amounts, tokenAmount)
  useWatchContractEvent({
    address: mintAddress,
    abi: mintAbi,
    eventName: 'TokensBurnedAndRedeemed',
    onLogs(logs) {
      console.log('TokensBurnedAndRedeemed', logs);
      const log = logs[0] as {
        args?: {
          user?: string;
          word?: string;
          ids?: number[];
          amounts?: number[];
          tokenAmount?: number;
        };
      };
      const user = log.args?.user;
      const ids = log.args?.ids;
      const tokenAmount = log.args?.tokenAmount;

      console.log('tokenAmount', tokenAmount);

      if (user === address) {
        const updatedLetters: { letter: string; balance: string }[] = letters;

        ids?.forEach((id) => {
          const index = parseInt(id.toString()) - 1;
          const newBalance = Number(letters[index].balance) - 1;
          letters[index].balance = newBalance.toString();
        });

        console.log('updatedLetters', updatedLetters);

        setLetters(updatedLetters);

        toast.success(
          `You earned ${formatEther(BigInt(tokenAmount ?? 0))} tokens`
        );
        setIsSubmitting(false);
      }
    },
  });

  const convertLettersToIds = (word: string) => {
    return word
      .toUpperCase()
      .split('')
      .map((letter) => letter.charCodeAt(0) - 64);
  };

  const handleSubmit = async () => {
    if (!word) {
      return;
    }
    if (!words.includes(word)) {
      alert('Word not found in dictionary');
      return;
    }

    try {
      setIsSubmitting(true);

      const ids = convertLettersToIds(word);
      const amounts = ids.map(() => 1);

      const response = await fetch('/api/merkle', {
        method: 'POST',
        body: JSON.stringify({ word }),
      });
      const { proof } = await response.json();

      const url = process.env.NEXT_PUBLIC_PAYMASTER_URL;

      const callsId = await sendCallsAsync({
        calls: [
          {
            to: mintAddress,
            data: encodeFunctionData({
              abi: mintAbi,
              functionName: 'burnAndRedeem',
              args: [word, ids, amounts, proof],
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
      toast.success('Letters burned successfully');
    } catch (error) {
      console.error('Error fetching proof:', error);
      toast.error('Error burning letters');
    }
  };

  if (balancesLoading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="border rounded-lg p-4 m-2">
      <div className="flex flex-col gap-2">
        <input
          type="text"
          className="text-black"
          value={word}
          onChange={(e) => setWord(e.target.value)}
          placeholder="Enter a word"
          disabled={isSubmitting}
        />
        <Button
          onClick={handleSubmit}
          disabled={isSubmitting || !words.includes(word)}
        >
          {isSubmitting ? 'Submitting...' : 'Submit'}
        </Button>
      </div>
      {letters
        .filter((letter) => Number(letter.balance) > 0)
        .map((letter) => (
          <div className="flex" key={letter.letter}>
            <h3 className="text-lg font-semibold">{letter.letter}</h3>
            <p className="text-sm text-gray-500">{letter.balance}</p>
          </div>
        ))}
    </div>
  );
}
