export const startTimer = () => {
  const start = process.hrtime.bigint();
  return () => {
    const end = process.hrtime.bigint();
    const diffNanoseconds = Number(end - start);
    return diffNanoseconds / 1_000_000; // convert to milliseconds
  };
};
