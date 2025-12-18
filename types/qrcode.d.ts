declare module "qrcode" {
  export function toString(
    text: string,
    options?: {
      type?: "svg" | "terminal" | "utf8";
      margin?: number;
      scale?: number;
      errorCorrectionLevel?: "L" | "M" | "Q" | "H";
    }
  ): Promise<string>;
}

