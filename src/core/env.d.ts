// コアは DOM の型を読み込まない (tsconfig.core.json)。ブラウザと Node の両方にある関数だけをここで宣言する
declare function btoa(data: string): string;
declare function atob(data: string): string;

declare class TextEncoder {
  encode(input?: string): Uint8Array;
}

declare class TextDecoder {
  decode(input?: Uint8Array): string;
}
