import dynamic from 'next/dynamic';

const Game = dynamic(() => import('./components/game'), {
  ssr: false,
});

export default function Home() {
  return (
    <div className="font-[family-name:var(--font-geist-sans)]">
      <Game />
    </div>
  );
}
