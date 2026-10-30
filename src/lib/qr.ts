import "server-only";
import QRCode from "qrcode";

/** QR-kod som SVG-text (svart på vitt, med marginal). */
export async function qrSvg(text: string) {
  return QRCode.toString(text, { type: "svg", errorCorrectionLevel: "M", margin: 2, color: { dark: "#000000", light: "#ffffff" } });
}
