# Vibe coding that only moves forward (v2 draft)

Vibe coding is steering an AI builder with a clear goal while a control
loop refuses to believe the work is done until the live product agrees.
This draft describes the system in generic, reader-applicable terms: how it
gates a deploy, how it heals itself when a step fails, and how a
read-only helper watches the whole thing without ever touching product code.
Every name below is a stand-in — swap in your own repo names, hostnames,
and tool of choice.

## The three pieces

The system is three small pieces working together, not one monolith:

- **The control loop** — a build → deploy gate → live test cycle that keeps
  running a step until it passes against the real, deployed product.
- **The goal-intake dashboard** — internally nicknamed the harness dashboard,
  the human-facing surface where a goal turns into a queue of small,
  verifiable steps. It lives behind a private, authenticated URL and is
  never linked from public navigation.
- **Read-only ops tooling** — an optional helper that watches a run and
  flags when it looks stuck, but never writes a line of product code.

## Deploy gating: don't grade what isn't live

The single rule that makes everything else honest: nothing gets graded
until the live site proves it is running the change that was just pushed.

The mechanism is a version endpoint. Every deploy serves the exact commit
SHA that is live, at a path the gate can poll without authentication. Before
the tester is allowed to look at anything, the gate polls that endpoint and
waits for the SHA to match what the builder just pushed. If the SHA never
shows up, the gate times out and the step is reported as failed — the same
outcome as a real bug, because from the outside they look identical.

A few strategies cover most products:

- **Version-endpoint polling (default)** — poll a small, public endpoint
  until it reports the new SHA. Cheapest and most honest signal available.
- **Fixed-delay fallback** — for a product with no version signal at all,
  wait a fixed delay long enough for a normal deploy to land, then proceed.
  Weaker, but better than nothing.
- **Command-based gate** — re-run a trusted, project-supplied command until
  it exits zero, for products that gate a deploy behind an external CI run
  rather than a simple polling endpoint. Only ever accept this command from
  the pipeline's own trusted configuration, never from an agent's free-form
  output — otherwise the gate itself becomes something an agent can talk its
  way past.

Common ways teams get this wrong, and the fix for each:

| Mistake                                          | Why it hurts                                              | Fix                                                                   |
| ------------------------------------------------ | --------------------------------------------------------- | --------------------------------------------------------------------- |
| No public version signal                         | The gate has nothing honest to poll                       | Serve the deployed commit SHA from every environment                  |
| Auth blocking the version path                   | Gate polls fail forever; the loop looks permanently stuck | Leave the version signal reachable without login                      |
| Repo and live URL pulled from different projects | Gate waits on a deploy that was never going to happen     | Bind one repo, one live URL, and one version URL together per project |
| Trusting the local working tree as "done"        | Live never actually catches up                            | Only the live URL counts; the gate waits for a SHA match first        |

## The self-healing loop

Once a deploy gate exists, the rest follows almost for free: build, gate,
test, and if the test fails, go back to build automatically — with the
tester's report attached — and try again. Nobody has to notice the failure
and restart it by hand. The loop just keeps holding the line until the
product passes.

A few contract details are what make this actually self-healing instead of
just automated retries:

- **Only a streak counts.** A single pass is not enough; the loop requires
  N consecutive live passes with no failure in between. One FAIL resets the
  streak counter to zero, even if nine passes came before it. This is what
  stops a flaky feature from sneaking through on a lucky run.
- **Proof of work has to be real.** A "done" claim from the builder is
  worth nothing on its own — the loop requires an actual advancing commit
  history, a clean working tree, and a remote that matches, before it will
  even ask the gate to check. Empty "success" commits and non-fast-forward
  history rewrites are both rejected outright.
- **Every invocation has a wall-clock ceiling and exactly one retry.** A
  builder or tester run that hangs is killed at its process group, its
  partial output is kept for the next attempt to read, and it gets one
  retry before the run stops and asks a human to look. Unbounded retries
  hide problems; a hard stop after one retry surfaces them instead.

This combination is the whole trick: the loop doesn't need a human to
notice a failure, because "not yet passing" is just its normal resting
state. It only needs a human when it has genuinely run out of automatic
options.

## Read-only ops tooling

Alongside the loop, it helps to run a small, strictly read-only helper that
watches for runs which look stuck — no test in progress, no recent commit,
no live SHA movement — and raises a flag. The rule that keeps this safe is
a hard separation of powers:

| Actor                | May                                      | Must not                                               |
| -------------------- | ---------------------------------------- | ------------------------------------------------------ |
| Builder / tester     | Change product code and verify it live   | Read stored credentials directly                       |
| Read-only ops helper | Observe run state and surface stuck runs | Implement product features, or become a second builder |

Three properties keep this helper from turning into a second, unaccountable
build path:

1. It never ships product UI or product features — observing and
   reporting is the entire job.
2. It runs single-flight, and it never auto-resumes or requeues a run that
   a human has explicitly put on hold, or that is still genuinely in
   progress. Respecting an operator's hold is not optional.
3. Whatever credentials or control tokens it needs to observe a run stay
   out of the same context a builder or tester ever sees, and out of any
   shared chat log.

Practically, this means the helper's dashboard is a separate, unlinked
surface — not part of the public site, not part of the goal-intake
dashboard's primary navigation — reachable only by whoever operates the
loop.

## Learnings from running this in production

These are concrete failures the loop actually hit, generalized past any
one project's specifics — what broke, what fixed it, and what to build
differently from the start.

**What failed:** an asynchronous "your run finished" callback from an
_earlier_ run landed after a human had already started a _fresh_ run on the
same screen, and the stale callback silently overwrote the new run's
in-progress state as if it were the old run's result. Nothing crashed;
the UI just quietly showed the wrong thing.

**The fix:** bind every asynchronous callback to the identifier of the run
it started under, and check that identifier before applying any side
effect. If the active run has moved on, the callback is dropped — not
merged, not partially applied, just discarded. The guard fails closed: an
unrecognized or empty run id changes nothing.

**Do this instead:** never assume an async callback arrives in the order
it was fired, and never let an arriving callback mutate shared state
without first proving it still belongs to the thing that's currently on
screen. Treat "does this update even apply anymore?" as a question you ask
before every write, not after something goes visibly wrong.

**What failed:** a "start over" action reset a run's state, but the reset
wasn't atomic with respect to whatever was still loading. A user could
trigger "start fresh" while the previous state was mid-hydration, and end
up with a run that was half-reset and half-stale — neither the old state
nor a clean one.

**The fix:** make the reset a single synchronous step that fully completes
before anything else is allowed to read state, instead of an
asynchronous reset racing an asynchronous read.

**Do this instead:** treat "clear and start over" as a transaction, not an
event. If a reset and a read can both be in flight at once, order them
explicitly rather than hoping they land in the order you expected.

**What failed:** a free-form "paste your results here" text box would
sometimes accept a partial or ambiguous paste — status chatter, a
truncated copy-paste, anything that merely looked report-shaped — and the
loop would treat it as a finished report and move on with incomplete data.

**The fix:** require a strict, unambiguous completion marker before any
pasted text is accepted as a final report. Anything short of the complete,
well-formed marker is rejected and the human is asked to paste again,
rather than the system guessing at what they meant.

**Do this instead:** for any step where a human hands unstructured text
back to an automated system, don't try to infer completeness from content
alone. Design the format so "done" is unambiguous and cheap to check
mechanically, and reject everything that doesn't match it exactly.

## What to steal for your own project

- Serve your deployed commit SHA from an unauthenticated endpoint, and
  make your pipeline wait for it to match before it grades anything.
- Only count consecutive passes toward "done" — one failure should reset
  the streak, not just pause it.
- Require real, verifiable proof of work (an actual commit, a clean tree,
  a matching remote) before you even bother checking the live site.
- Put a hard wall-clock ceiling and a fixed retry count on every automated
  step, so a hang fails loudly instead of hanging forever.
- If you add a monitoring helper, make it strictly read-only and keep it
  off the same write path as your builder — and don't be shy about
  building this against whatever tool you already use, whether that's an
  in-house agent or one of the many third-party AI coding assistants now
  available.
- Bind every asynchronous callback to the run it belongs to, and design
  every reset as an atomic step, not a race.
- Give unstructured human input a strict, mechanically checkable
  completion marker before your system treats it as final.

This pattern, and the failures above, come out of actually running it in
production — documented and kept current by the project maintainer behind
the repository this draft was written from.
