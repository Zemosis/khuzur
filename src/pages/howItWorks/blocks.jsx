// HOW IT WORKS — the small pieces the chapters are written with: gold terms,
// inline code, formulas, lists and tables.

import React from "react";
import PixelIcon from "../../components/PixelIcon";

export const T = ({ children }) => <span className="text-gold">{children}</span>;
export const C = ({ children }) => <code className="font-mono text-[0.8em] text-bone bg-void/70 px-1">{children}</code>;

export function Formula({ children }) {
  return (
    <pre className="bg-void/70 border-2 border-mist/40 px-3 py-2 font-mono text-[13px] sm:text-[14px] leading-relaxed text-bone whitespace-pre-wrap break-words">
      {children}
    </pre>
  );
}

export function List({ items }) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map(([term, text]) => (
        <li key={term} className="flex gap-3">
          <span className="text-gold shrink-0 mt-1.5" aria-hidden>
            <PixelIcon name="right" size={10} />
          </span>
          <span>
            <span className="text-gold">{term}</span> — {text}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** A small table: rows of cells, the first row the header. */
export function Grid({ rows }) {
  const [head, ...body] = rows;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[17px] sm:text-[19px]">
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} className="text-left text-gold font-normal border-b-2 border-mist/40 py-1 pr-4 align-bottom">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, r) => (
            <tr key={r}>
              {row.map((cell, i) => (
                <td key={i} className="border-b border-mist/20 py-1 pr-4 align-top">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** m × 10^e with a real superscript (the pixel font has no small digits). */
export function Pow({ m, e }) {
  return (
    <>
      {m} × 10<sup>{e}</sup>
    </>
  );
}
