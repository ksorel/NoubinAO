declare module "word-extractor" {
  interface ExtractedDocument {
    getBody(): string;
  }

  export default class WordExtractor {
    extract(input: Buffer | string): Promise<ExtractedDocument>;
  }
}
