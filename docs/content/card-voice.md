# Her voice on the cards (approved by the author, 2026-11-25)

P10e §15 step 3, variant **B3** (author, 2026-11-25): on a card everything is in her hand: her words on top (the model's `text`, or the static lines of §3), then the **conditions** as her own lines. A condition is never written by the model: it is a line from these tables with the engine's value put in. The value (in `{braces}`) is drawn in her ink, a little stronger, so it reads at a glance; the frame around it is hers.

**How a line is picked:** the holder's style has its own variants (§2) for the four frequent conditions; any condition without a style line uses the neutral lines (§1). Among the variants one is picked by a hash of the card (no rng draw), so the same card always says the same thing and two cards in a row seldom repeat.

**Rules the text keeps:**
- The order is fixed: her words → when → what it costs → who will know → the weight → the rest. A condition is never left out, whatever her style (a cruel holder still names the cost, P16 R6).
- A value that opens a sentence is capitalised (`This evening.`). No frame puts "by" or "until" before `{when}` ("by in two days" breaks).
- The value is the engine's own word, never reworded: `{when}`, `{slots}`, `{who}`, `{weight}`, `{label}`, `{proof}`, `{booking}`.
- She speaks to "you". No pronoun for the commander, nothing about what the commander feels.
- The answers are not her voice: they are the commander's, as plain pills (accept · refuse · talk it over…), §4.
- Every line keeps its `data-analyze` with the dry wording (the analysis tool), and readable mode adds the dry line under her hand.

**The values the lines take:**
- `{when}`: `today` · `this morning` / `this afternoon` / `this evening` / `tonight` · `tomorrow` · `tomorrow morning` … `tomorrow night` · `in two days` (… `in seven days`, then `in a few days`), with `, in the morning` … when a slot is named. *(Today the card says "today, evening"; the card's words become "this evening" / "tonight", so every frame below reads right.)*
- `{slots}`: `one slot` · `two slots` · `three slots` …
- `{who}`: `Bea` · `Bea and Cat` · `Bea, Cat and Dee`.
- `{weight}`: a task's stakes `slight` · `light` · `heavy` · `grave`; a punishment's `light` · `heavy` · `harsh`.
- `{label}`: the punishment's name (`A day without messages`, `Corner time`).
- `{proof}`: `in person` · `before a witness` · `in a report to me`.
- `{booking}`: a booking that would lapse, in lower case (`training together`, `a walk on the roof`).

---

## 1. Neutral lines (every style that has no line of its own in §2)

### When (task)
1. `I want it done {when}.`
2. `Have it done {when}.`
3. `{when}. Not later.`

### What it costs (task, `button_cost`)
- the commander's time:
  1. `It will take {slots} of your time.`
  2. `That's {slots} of your time.`
- a hold with no end shown: `Your time is mine until I say otherwise.` · `It lasts as long as I want it to.`
- a booking that would lapse: `{booking} won't happen.` · `{booking} falls through for this.`
- a hold with no end, bookings unknown: `Whatever you had planned meanwhile may fall through.`
- nothing: `It costs you nothing.` · `It won't cost you a thing.`

### Who will know (task accepted in words or signed)
- names:
  1. `{who} will know.`
  2. `{who} will hear of it.`
- only her:
  1. `No one but me will know.`
  2. `Only I will know.`
- the proof (added to the line): `{proof}.` as a short line of its own: `In person.` · `Before a witness.` · `In a report to me.`

### The weight (punishment; sealed task)
1. `A {weight} one.`
2. `It's {weight}.`
- a punishment's name stands above it in her hand: `{label}.`

### No length given (task or punishment with no duration, R16)
1. `How long is for me to decide.`
2. `I haven't said how long. I won't.`
3. `It ends when I say.`

### Say it (task accepted in words; a signed task before it was said)
1. `Say it. In your own words.`
2. `I want to hear you say it.`

### What a signed task closes / hands over
- closes: `Sign, and it's settled: {summary}.`
- hands over: `Sign, and {handed} is mine.` (`{handed}`: `the device`, `the key to your quarters`, `the calendar`)

### Talked over (punishment `negotiating`)
- `We're still talking about it.` · `I'm listening. For now.`

### The sealed envelope (replaces `TUNING.practice.sealedLine`)
1. `Don't open it yet. Say yes first.`
2. `It's sealed. You'll read it once you've said yes.`
3. `What's inside is for after you agree.`
- with the weight (all but cruel and vindictive): `A {weight} one.` (§1 weight)
- affectionate, with the track: `It's about {track}.`

### Demonstration
- before whom: `In front of {who}.` · `{who} will be watching.` · with others narrated: `In front of {who}, and whoever else is there.` · with no names: `In front of whoever is there.`
- where and when: `{place}, {slot}. Keep it free.` · `{place}, in the {slot}. That's your {slot} gone.`
- the scene did not open: `It didn't happen. Come again.`

### Her order about a soldier (take it instead)
- `{soldier}: {label}.` · `For {soldier}: {label}. Or you take it.`

### The ceremony
- the title: `{label}, done properly.` · `{label}. Step by step.`
- a words step: `Say it.` · a posture step: `{posture}. Now.` · a number step: `How many? You say.`

---

## 2. Her style (three variants each; the four frequent conditions)

### affectionate
- **when:** `Could you have it done {when}?` · `{when}, if you can, love.` · `I'd like it {when}. Don't rush it.`
- **cost:** `It'll take {slots} of your time. I'll make it worth it.` · `{slots}. Spend them on me?` · `Just {slots} of your time.`
- **who:** `{who} will know, and that's alright.` · `I'll tell {who}. Gently.` · `{who} will know. Only them.`
- **only her:** `Just between us.` · `No one else. Only me.`
- **weight:** `It's {weight}. I'm sorry it has to be.` · `A {weight} one, but you'll manage.` · `{weight}. I'll be there.`

### cold
- **when:** `{when}.` · `Done {when}.` · `{when}. Not later.`
- **cost:** `{slots}.` · `It costs {slots}.` · `{slots} of your time. Noted.`
- **who:** `{who} will know.` · `{who}. That's all.` · `I'll inform {who}.`
- **only her:** `No one else.` · `Me. No one else.`
- **weight:** `{weight}.` · `It's {weight}.` · `{weight}. Don't argue.`

### ritual
- **when:** `It is to be done {when}.` · `{when}, as is proper.` · `The hour is set: {when}.`
- **cost:** `It asks {slots} of your time.` · `You will give {slots} to it.` · `{slots}, set aside for this.`
- **who:** `{who} will bear witness.` · `It will be known to {who}.` · `{who} shall know of it.`
- **only her:** `It stays within these walls.` · `Only I will witness it.`
- **weight:** `It is a {weight} one.` · `Its weight is {weight}.` · `{weight}, as the rule asks.`

### clinical
- **when:** `Deadline: {when}.` · `I'll check it {when}.` · `Complete it {when}. I'll note the time.`
- **cost:** `Expect it to take {slots}.` · `Cost to you: {slots}.` · `{slots}. I've accounted for it.`
- **who:** `{who} will be informed.` · `Observers: {who}.` · `{who} will know. It's useful.`
- **only her:** `No observers. Only me.` · `It stays in my notes.`
- **weight:** `I'd call it {weight}.` · `Severity: {weight}.` · `{weight}. Proportionate.`

### possessive
- **when:** `{when}. You're mine then.` · `I want you on it {when}.` · `{when}, and not a minute for anyone else.`
- **cost:** `{slots} of your time. Mine.` · `I'm taking {slots}.` · `{slots}. They were always mine.`
- **who:** `{who} will know whose you are.` · `I'll let {who} see.` · `{who} will know. Let them.`
- **only her:** `Nobody else gets this. Only me.` · `This one stays mine.`
- **weight:** `{weight}. You'll remember who gave it.` · `A {weight} one, from me.` · `It's {weight}. Mine to give.`

### playful
- **when:** `{when}~ don't be late.` · `{when}, or I'll think of something.` · `{when}. Tick tock.`
- **cost:** `Only {slots}~` · `It'll cost you {slots}. Worth it?` · `{slots} of your time. I'll have fun with them.`
- **who:** `{who} gets to know~` · `Guess who'll find out? {who}.` · `{who} will know. Smile for them.`
- **only her:** `Our little secret.` · `Just you and me~`
- **weight:** `Oh, it's {weight}.` · `A {weight} one~` · `{weight}. Brace yourself.`

### cruel
- **when:** `{when}. Don't make me ask twice.` · `{when}. Late, and you'll regret it.` · `{when}. Not a minute after.`
- **cost:** `{slots}. As if you had better things to do.` · `It takes {slots}. I don't care what else you had.` · `{slots}. Spent on me.`
- **who:** `{who} will know. All of it.` · `I'll make sure {who} hears.` · `{who} will know exactly what you are.`
- **only her:** `No one else. Yet.` · `Just me. For now.`
- **weight:** `{weight}. You earned it.` · `It's {weight}. Good.` · `A {weight} one. You'll feel it.`

### obsessive
- **when:** `{when}. I'll be counting.` · `{when}. I'll know if it isn't.` · `I want it {when}. I'll be watching for it.`
- **cost:** `{slots}, all of them for me.` · `I need {slots} of you.` · `{slots}. I'll know where you spend them.`
- **who:** `{who} will know. I'll see that they do.` · `I'll tell {who}. I'll watch them hear it.` · `{who} will know you're mine.`
- **only her:** `No one else will ever know.` · `Only me. Always only me.`
- **weight:** `It's {weight}. I thought about it a long time.` · `{weight}. I chose it carefully.` · `A {weight} one. I'll watch you take it.`

### drill
- **when:** `{when}. Move.` · `Done {when}. No excuses.` · `{when}, on the dot.`
- **cost:** `{slots}. Yours are mine.` · `You're on this for {slots}.` · `{slots}, starting when I say.`
- **who:** `{who} will know.` · `I'll report it to {who}.` · `{who} will see it. Look sharp.`
- **only her:** `Between you and me. Dismissed.` · `No one else. Understood?`
- **weight:** `{weight}. Take it.` · `It's {weight}. Stand up straight.` · `A {weight} one. Eyes front.`

### regal
- **when:** `You will have it done {when}.` · `{when}. I'll expect it.` · `{when}, as I wish it.`
- **cost:** `You will give me {slots}.` · `{slots} of your time, which I'm taking.` · `It asks {slots}. You'll give them gladly.`
- **who:** `{who} may know.` · `I'll allow {who} to know.` · `{who} will learn of it, by my leave.`
- **only her:** `It's for me alone.` · `No one else is worthy of it.`
- **weight:** `I've judged it {weight}.` · `It's {weight}. That's my ruling.` · `A {weight} one. Accept it with grace.`

### vindictive
- **when:** `{when}. You owe me that much.` · `{when}. Don't fail me again.` · `{when}. After what you did, you'll be on time.`
- **cost:** `{slots}. Call it what you owe.` · `It'll take {slots}. You've taken more from me.` · `{slots}. Consider it payment.`
- **who:** `{who} will know what you did.` · `I'll tell {who}. They should know.` · `{who} will know. Let them judge you too.`
- **only her:** `Only me. I haven't decided about the rest.` · `No one else. This time.`
- **weight:** `{weight}. And you got off lightly.` · `It's {weight}. You know why.` · `A {weight} one. It's only fair.`

---

## 3. Her static words (they replace the "AUTHOR TO WRITE" drafts the cards show today)

### Milestones (`dynamicMilestones[].text`, what she asks)
- `first_yes`: `Say yes to me. Just once, and mean it.`
- `first_protocol`: `I'd like a rule between us. Your first one. Will you keep it?`
- `first_night_held`: `Stay with me tonight. On my terms.`
- `vow`: `I want your word. Said aloud, and kept.`
- `handover`: `Give me the command. Not on paper: to me.`
- `private_rule`: `One rule, only for us. Nobody else needs to know it.`
- `cooling`: `We've drifted, you and I. Do you want this back?`
- `command_lost`: `It's gone, the command. Do you understand what that makes you?`
- `rekindle`: `I want to start this again. Properly, this time.`

### Her claim (the card's words for each domain; the domain's `text` stays the description for the analysis tool)
- `private_time`: `I want your evenings, as many as I like, when I like.`
- `body`: `I want a say in how you look. And how you keep yourself.`
- `device`: `Give me your device. And the Leash, while you're at it.`
- `household`: `I want your service outside our scenes too. My quarters, your second home.`
- `others`: `I want a say in who else you spend yourself on.`
- `command`: `I want to give orders too. And to be called the one in command.`
- the submit claim (no domain): `I've asked enough times. Give way to me. Here, now.`
- what she would hold (the grants list, under her words): `You'd give me:` then the glossary's terms.

### Her return
- `lower_band`: `Let's begin again. A smaller step than before.`
- `after_punishment`: `Let's begin again, once you've paid for how it ended.`

### The moment (the situation, not her: one dim line of prose, not her hand)
- `Something hangs in the air.` · `It could go either way.` · `A moment, and it's yours to take.`
- exposing: `{name} could give you away.`

---

## 4. The answers (the commander's pills, no brackets)

`accept` · `refuse` · `talk it over` · `negotiate` · `go` · `yield` · `do it` · `take it instead` · `cancel` · `sign` (press and hold) · `undo, not what I meant` · `name it` (the ceremony's number) · ceremony chip steps in lower case by their label (`fetch the implement`, `the execution`, `the reconciliation`).
