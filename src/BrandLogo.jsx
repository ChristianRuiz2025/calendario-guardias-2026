import React from "react";
import logoLight from "./assets/siclik-cesa.png";
import logoDark from "./assets/siclik-cesa-dark.png";
import mark from "./assets/siclik-mark.png";

// Logo de siclik CESA. Se cargan las dos versiones y el CSS muestra la del tema
// (ver .brand-logo-light / .brand-logo-dark en styles.css).
export default function BrandLogo({ className = "" }) {
  return (
    <div className={className}>
      <img className="brand-logo-light" src={logoLight} alt="siclik CESA" />
      <img className="brand-logo-dark" src={logoDark} alt="siclik CESA" />
    </div>
  );
}

// Solo la flecha, en un cuadro blanco (barra lateral).
export function BrandMark() {
  return (
    <span className="brand-mark">
      <img src={mark} alt="siclik CESA" />
    </span>
  );
}
