import { readFileSync } from 'fs';
const lines = readFileSync('frontend/src/Chat.tsx', 'utf8').split('\n');
console.log('Total lines:', lines.length);
lines.forEach((l, i) => {
  const n = i + 1;
  if (
    l.match(/^  \/\/ ---/) ||
    l.match(/^  const [a-z]/) ||
    l.match(/^  useEffect\(/) ||
    l.match(/^  useLayoutEffect\(/) ||
    l.match(/^  return \(/) ||
    l.match(/^function Chat/)
  ) {
    console.log(n + ': ' + l.substring(0, 120));
  }
});
