// tutor-maintainer: one CLI, one subcommand per step of session 5, part C.
//
//   npm run maintainer -- hello              C1  query() instead of claude -p
//   npm run maintainer -- tests              C2  custom tool, typed output
//   npm run maintainer -- fix "<finding>"    C3  human gate, hook, rewind
//   npm run maintainer -- review [--single]  C4  a team of subagents
//   npm run maintainer -- race "<finding>"   C5  two fixers, two worktrees
//
// Add --otel to any of them to send traces to Jaeger (C6).
import { fix } from "./fix";
import { hello } from "./hello";
import { race } from "./race";
import { review } from "./review";
import { tests } from "./tests";

const args = process.argv.slice(2).filter((a) => a !== "--otel");
const [command, ...rest] = args;
const text = rest.filter((a) => !a.startsWith("--")).join(" ");

switch (command) {
  case "hello":
    await hello();
    break;
  case "tests":
    await tests();
    break;
  case "fix":
    await fix(text);
    break;
  case "review":
    await review(rest.includes("--single"));
    break;
  case "race":
    await race(text);
    break;
  default:
    console.error(
      "Usage: npm run maintainer -- <hello|tests|fix|review|race> [...] [--otel]",
    );
    process.exit(2);
}
