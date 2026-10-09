import Link from "next/link";
import QRCode from "qrcode";
import { CodeXml, ExternalLink, FolderGit2, HeartHandshake, MessageCircle, MessageSquareWarning, Star } from "lucide-react";
import { project } from "@/content/project";
import { ISSUES_URL } from "@/content/references";
import { apiBaseUrl } from "@/lib/api";
import { CopyText } from "@/components/donate";
import { Logo } from "@/components/logo";

export const metadata = { title: "About · Drivechain Observatory", description: "Who builds the Drivechain Observatory, its open-source code, and how to support it." };

export default async function Page() {
  // Generated at build time on the server; it holds only the address so BTC and ECX wallets can both read it.
  const qr = await QRCode.toString(project.donationAddress, { type: "svg", errorCorrectionLevel: "M", margin: 2, color: { dark: "#120c04", light: "#f5f2ed" } });
  return <main className="page-shell wide about">
    <section className="about-hero">
      <Logo size={72}/>
      <div><div className="eyebrow">ABOUT THE PROJECT</div><h1>Drivechain Observatory</h1>
        <p className="lede">A place to learn drivechains by watching them run. Every lesson explains one idea in plain words and shows it live on eCash Betanet, with the proof behind every number.</p></div>
    </section>

    <section className="about-section">
      <h2>About us</h2>
      <p>The Observatory is built and maintained by <a className="text-link" href={project.maintainer.href} target="_blank" rel="noopener noreferrer">{project.maintainer.name}</a> as an independent, open-source project. It runs its own eCash Betanet node and the official BIP300/301 enforcer, records everything they report, and turns it into lessons anyone can follow.</p>
      <div className="contact-line"><MessageCircle size={18}/><span>Questions, ideas or want to help? Reach me on <strong>Discord</strong>:</span><CopyText value={project.maintainer.discord} label="Copy username" className="contact-copy"/></div>
      <p>It is made possible by the support of <a className="text-link" href="https://libreriadesatoshi.com/" target="_blank" rel="noopener noreferrer">Librería de Satoshi</a> and <a className="text-link" href="https://b4os.dev/" target="_blank" rel="noopener noreferrer">B4OS</a>.</p>
    </section>

    <section className="about-section">
      <h2>Open source</h2>
      <p>All the code is public under the MIT license. You can read it, run your own copy, or help improve it.</p>
      <div className="repo-cards">
        <a href={project.repos.observatory} target="_blank" rel="noopener noreferrer"><FolderGit2 size={20}/><strong>drivechain-observatory</strong><span>This website, its API and the verified copy of the data. The lessons and their fact check live here.</span><small>github.com/GuiSchet/drivechain-observatory <ExternalLink size={12}/></small></a>
        <a href={project.repos.monitor} target="_blank" rel="noopener noreferrer"><FolderGit2 size={20}/><strong>bip300-monitor</strong><span>The monitor that watches the Betanet node and the enforcer and records every reading they report.</span><small>github.com/GuiSchet/bip300-monitor <ExternalLink size={12}/></small></a>
      </div>
      <p className="about-links"><a className="text-link" href={ISSUES_URL} target="_blank" rel="noopener noreferrer">Report an issue</a> · <a className="text-link" href={`${apiBaseUrl}/docs`} target="_blank" rel="noopener noreferrer">API reference</a> · <Link className="text-link" href="/learn/how-we-know">How the data is collected</Link></p>
    </section>

    <section className="about-section donate" id="support">
      <h2><HeartHandshake size={24}/> Help the project</h2>
      <p>Running the Observatory costs money: a server, a Betanet node kept in sync, and time to maintain the code and the lessons. Donations keep it online and free for everyone.</p>
      <div className="donate-box">
        <div className="donate-qr" role="img" aria-label={`QR code for the donation address ${project.donationAddress}`} dangerouslySetInnerHTML={{ __html: qr }}/>
        <div className="donate-info">
          <span className="nc-kicker">Donation address</span>
          <CopyText value={project.donationAddress} label="Copy address"/>
          <p>This address accepts <strong>BTC</strong> today and <strong>ECX</strong> once eCash&apos;s mainnet launches: eCash keeps Bitcoin&apos;s address format, so the same address works on both.</p>
          <p className="donate-warning">Always check the address after pasting it into your wallet.</p>
        </div>
      </div>
      <h3>Other ways to help</h3>
      <ul className="help-list">
        <li><Star size={16}/><span><a className="text-link" href={project.repos.observatory} target="_blank" rel="noopener noreferrer">Star the repositories</a> and share the site with people learning about drivechains.</span></li>
        <li><MessageSquareWarning size={16}/><span>Spotted a mistake in a lesson? <a className="text-link" href={ISSUES_URL} target="_blank" rel="noopener noreferrer">Open an issue</a>; every claim is checked against its source.</span></li>
        <li><CodeXml size={16}/><span>Contributions are welcome: lessons, translations, design and code.</span></li>
      </ul>
    </section>
  </main>;
}
