'use client';

import { mintAbi, mintAddress } from '@/lib/mint';
import { useReadContract } from 'wagmi';

export default function Letters({ address }: { address: string }) {
  const accounts = Array.from({ length: 26 }, () => address);
  const ids = Array.from({ length: 26 }, (_, i) => i);

  const { data: balances, isLoading: balancesLoading } = useReadContract({
    address: mintAddress,
    abi: mintAbi,
    functionName: 'balanceOfBatch',
    args: [accounts, ids],
  });

  const letters = Array.isArray(balances)
    ? balances.map((_, index) => ({
        letter: String.fromCharCode(65 + index),
        balance: balances[index + 1]?.toString() ?? '0',
      }))
    : [];

  if (balancesLoading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="border rounded-lg p-4 m-2">
      {letters.map((letter) => (
        <div className="flex" key={letter.letter}>
          <h3 className="text-lg font-semibold">{letter.letter}</h3>
          <p className="text-sm text-gray-500">{letter.balance}</p>
        </div>
      ))}
    </div>
  );
}
