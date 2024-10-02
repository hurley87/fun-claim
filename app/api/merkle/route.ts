import { NextRequest } from 'next/server';
import keccak256 from 'keccak256';
import { MerkleTree } from 'merkletreejs';
import { words } from '@/lib/dictionary';

export async function POST(req: NextRequest) {
  const { word } = await req.json();

  try {
    const leaves = words.map((word) => keccak256(word));
    const tree = new MerkleTree(leaves, keccak256, {
      sortPairs: true,
    });
    const leaf = keccak256(word);
    const leafProof = tree.getProof(leaf);
    const bufferToHex = (x: any) => '0x' + x.toString('hex');
    const proof = leafProof.map((x: any) => bufferToHex(x.data));

    return new Response(JSON.stringify({ proof }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'An error occurred' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
