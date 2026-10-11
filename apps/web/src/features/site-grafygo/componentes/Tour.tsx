import { useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { TOUR } from "../tour";

/**
 * "Conheça por dentro": uma aba por área do sistema, com a tela de verdade (captura da empresa de demonstração)
 * e o que ela resolve. No celular, as abas deslizam para o lado e há setas para passar.
 */
export function Tour() {
  const [ativo, setAtivo] = useState(0);
  const area = TOUR[ativo] ?? TOUR[0]!;
  const abas = useRef<HTMLDivElement>(null);

  // A aba escolhida fica visível na faixa (celular)
  useEffect(() => {
    abas.current
      ?.querySelector<HTMLElement>(`[data-aba="${ativo}"]`)
      ?.scrollIntoView({
        block: "nearest",
        inline: "center",
        behavior: "smooth",
      });
  }, [ativo]);

  // Carrega a próxima imagem antes do clique (troca sem piscar)
  useEffect(() => {
    const proxima = TOUR[(ativo + 1) % TOUR.length];
    if (proxima) new Image().src = proxima.imagem;
  }, [ativo]);

  const passar = (dir: 1 | -1) =>
    setAtivo((i) => (i + dir + TOUR.length) % TOUR.length);

  return (
    <div className="grid gap-8 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-10">
      <div
        ref={abas}
        role="tablist"
        aria-label="Áreas do sistema"
        aria-orientation="vertical"
        className="vt-sem-barra flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible"
      >
        {TOUR.map((t, i) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`aba-${t.id}`}
            data-aba={i}
            aria-selected={i === ativo}
            aria-controls="painel-tour"
            onClick={() => setAtivo(i)}
            className={cn(
              "group flex shrink-0 items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0265DC]",
              i === ativo
                ? "bg-[#021A40] text-white shadow-lg"
                : "bg-white text-slate-700 ring-1 ring-slate-200 hover:ring-slate-400 lg:bg-transparent lg:ring-0 lg:hover:bg-white",
            )}
          >
            <span
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                i === ativo
                  ? "bg-white/15 text-white"
                  : "bg-[#E6F2FE] text-[#0265DC]",
              )}
            >
              <t.icone
                className="h-[1.125rem] w-[1.125rem]"
                aria-hidden="true"
              />
            </span>
            <span className="whitespace-nowrap lg:whitespace-normal">
              {t.rotulo}
            </span>
          </button>
        ))}
      </div>

      <div
        id="painel-tour"
        role="tabpanel"
        aria-labelledby={`aba-${area.id}`}
        className="min-w-0"
      >
        <div className="overflow-hidden rounded-2xl bg-white shadow-[0_2rem_4rem_-1.5rem_rgba(2,26,64,0.35)] ring-1 ring-slate-900/10">
          <div className="flex items-center gap-1.5 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
            <span
              className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]"
              aria-hidden="true"
            />
            <span
              className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]"
              aria-hidden="true"
            />
            <span
              className="h-2.5 w-2.5 rounded-full bg-[#28C840]"
              aria-hidden="true"
            />
            <span className="ml-3 flex-1 truncate rounded-md bg-white px-3 py-1 text-[0.6875rem] text-slate-400 ring-1 ring-slate-200">
              {area.endereco}
            </span>
          </div>
          {/* No celular a tela fica pequena: tocar abre em tamanho real */}
          <a
            href={area.imagem}
            target="_blank"
            rel="noopener"
            aria-label={`Ampliar: ${area.alt}`}
            className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0265DC]"
          >
            <img
              key={area.id}
              src={area.imagem}
              alt={area.alt}
              width={1600}
              height={1000}
              loading="lazy"
              decoding="async"
              className="block aspect-[16/10] w-full bg-slate-100 object-cover object-top motion-safe:animate-[vt-surgir_0.35s_ease-out]"
            />
          </a>
        </div>

        <div className="mt-7 grid gap-6 md:grid-cols-[1fr_1.1fr] md:items-start">
          <div>
            <h3 className="font-titulo text-2xl font-extrabold text-[#021A40]">
              {area.titulo}
            </h3>
            <p className="mt-2 leading-relaxed text-slate-600">{area.texto}</p>
          </div>
          <ul className="grid gap-2.5 text-sm text-slate-700">
            {area.pontos.map((p) => (
              <li key={p} className="flex items-start gap-2.5">
                <Check
                  className="mt-0.5 h-4 w-4 shrink-0 text-[#0265DC]"
                  aria-hidden="true"
                />{" "}
                {p}
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-6 flex items-center justify-between gap-3 border-t border-slate-200 pt-5">
          <p className="text-sm text-slate-500">
            {ativo + 1} de {TOUR.length}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => passar(-1)}
              aria-label="Área anterior"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-800 ring-1 ring-slate-300 hover:ring-slate-500"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => passar(1)}
              className="inline-flex h-10 items-center gap-1.5 rounded-full bg-[#021A40] pl-4 pr-3 text-sm font-semibold text-white hover:bg-[#0B2A5C]"
            >
              {TOUR[(ativo + 1) % TOUR.length]?.rotulo}{" "}
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
