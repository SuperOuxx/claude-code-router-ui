
console.log("Arguments received:");
process.argv.forEach((val, index) => {
  console.log(`${index}: ${JSON.stringify(val)}`);
});
