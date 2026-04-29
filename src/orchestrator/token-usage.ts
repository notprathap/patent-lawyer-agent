interface HasTokenUsage {
  totalTokensUsed: { input: number; output: number };
}

export function addTokenUsage<T extends HasTokenUsage>(
  session: T,
  tokens: { input: number; output: number },
): void {
  session.totalTokensUsed.input += tokens.input;
  session.totalTokensUsed.output += tokens.output;
}
