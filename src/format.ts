export const number = (n: number, decimals = 0) => n.toLocaleString('en-GB', { maximumFractionDigits: decimals, minimumFractionDigits: decimals });
export const percent = (n: number) => `${number(n * 100, 1)}%`;
