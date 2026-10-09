import Image from "next/image";
import Link from "next/link";
import { project } from "@/content/project";

export function SiteFooter() {
  return (
    <footer className="site-footer" aria-labelledby="supporters-heading">
      <div className="supporter-copy">
        <h2 id="supporters-heading">Made possible by</h2>
        <p>
          This project is only possible thanks to Librería de Satoshi and B4OS.
        </p>
        <p className="footer-links">
          <Link href="/about">About the project</Link>
          <Link href="/about#support">Support the project</Link>
          <a href={project.repos.observatory} target="_blank" rel="noopener noreferrer">Source code</a>
          <span>Discord: <strong>{project.maintainer.discord}</strong></span>
        </p>
      </div>
      <div className="supporter-links">
        <a
          className="supporter-link"
          href="https://libreriadesatoshi.com/"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Image
            className="supporter-logo supporter-logo-libreria"
            src="/supporters/libreria-de-satoshi.svg"
            alt="Librería de Satoshi"
            width={680}
            height={220}
            unoptimized
          />
        </a>
        <a
          className="supporter-link"
          href="https://b4os.dev/"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Image
            className="supporter-logo supporter-logo-b4os"
            src="/supporters/b4os.png"
            alt="B4OS — Bitcoin 4 Open Source"
            width={500}
            height={190}
            unoptimized
          />
        </a>
      </div>
    </footer>
  );
}
