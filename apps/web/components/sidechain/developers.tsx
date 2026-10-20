"use client";
import { useApiBase } from "@/components/providers";
import { CopyText, LivePanel } from "@/components/learn/primitives";
import { SidechainDownload } from "@/components/live/trust";

/** The same data from the command line: the endpoints behind this page, ready to copy. */
export function DevelopersSection({ slot, name, technical }: { slot: number; name: string; technical: boolean }) {
  const apiBaseUrl = useApiBase();
  const lines: [string, string][] = [
    ["Everything, as a ZIP of CSV files", `curl -OJ ${apiBaseUrl}/api/v1/sidechains/${slot}/dataset`],
    ["The figures at the top of this page", `curl ${apiBaseUrl}/api/v1/sidechains/${slot}/stats`],
    ["Deposits, 200 per page", `curl "${apiBaseUrl}/api/v1/deposits?slot=${slot}&limit=200"`],
    ["Merged-mining commitments", `curl "${apiBaseUrl}/api/v1/bmm/commitments?slot=${slot}&limit=200"`],
    ["Withdrawal bundles", `curl "${apiBaseUrl}/api/v1/bundle-attempts?slot=${slot}&limit=200"`],
  ];
  return <>
    <SidechainDownload slot={slot} name={name}/>
    {technical && <LivePanel title="For developers">
      <p className="live-lede">The API behind this page. Lists return <code>next_cursor</code>: pass it as <code>&amp;cursor=</code> for the next page. A cursor keeps reading the data as it was when the first page was read.</p>
      <ul className="code-lines">{lines.map(([label, cmd]) => <li key={label}><span>{label}</span><CopyText value={cmd} label="Copy" className="code-line"/></li>)}</ul>
      <p className="live-note">Every endpoint and field: <a className="text-link" href={`${apiBaseUrl}/docs`} target="_blank" rel="noopener noreferrer">API reference</a>.</p>
    </LivePanel>}
  </>;
}
