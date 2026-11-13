export default function CarregandoLivion() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-[#0F172A]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/marca/icone-192.png"
        alt="Carregando Livion"
        width={64}
        height={64}
        style={{ width: 64, height: 64 }}
        className="animate-pulse object-contain"
      />
      <p className="mt-3 text-xs font-medium text-slate-400">
        Abrindo sua estante...
      </p>
    </div>
  );
}
