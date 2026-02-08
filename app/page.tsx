import Link from 'next/link';

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-24 bg-black text-white">
      <h1 className="text-5xl font-bold mb-8 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-600">
        Sera Auto AI
      </h1>

      <div className="grid text-center lg:max-w-5xl lg:w-full lg:mb-0 lg:grid-cols-2 lg:text-left gap-4">
        <Link
          href="/admin"
          className="group rounded-lg border border-neutral-700 px-5 py-4 transition-colors hover:border-neutral-500 hover:bg-neutral-800/30"
        >
          <h2 className="mb-3 text-2xl font-semibold">
            Admin Dashboard <span className="inline-block transition-transform group-hover:translate-x-1 motion-reduce:transform-none">-&gt;</span>
          </h2>
          <p className="m-0 max-w-[30ch] text-sm opacity-50">
            Monitor chats, sales, and toggle AI availability.
          </p>
        </Link>

        <a
          href="#"
          className="group rounded-lg border border-neutral-700 px-5 py-4 transition-colors hover:border-neutral-500 hover:bg-neutral-800/30"
        >
          <h2 className="mb-3 text-2xl font-semibold">
            WhatsApp Bot <span className="inline-block transition-transform group-hover:translate-x-1 motion-reduce:transform-none">-&gt;</span>
          </h2>
          <p className="m-0 max-w-[30ch] text-sm opacity-50">
            Interact with Sera Auto via WhatsApp (requires setup).
          </p>
        </a>
      </div>
    </div>
  );
}
