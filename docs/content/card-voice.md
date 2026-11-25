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
- `{slots}`: `one slot` · `two slots` · `three slots` … (a frame reads with one slot as well as with three: it never says "them" of the slots)
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
- **cost:** `It'll take {slots} of your time. I'll make it worth it.` · `{slots} of your time. Spend it on me?` · `Just {slots} of your time.`
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
- **when:** `{when}. Keep the rest of the day clear.` · `I want you on it {when}.` · `{when}, and not a minute for anyone else.`
- **cost:** `{slots} of your time, and I want all of it.` · `I'm taking {slots}.` · `{slots} of your time. Don't give it to anyone else.`
- **who:** `{who} will know who you answer to.` · `I'll let {who} see.` · `{who} will know. Let them.`
- **only her:** `Nobody else gets this. Only me.` · `This one stays between us. Don't share it.`
- **weight:** `{weight}. You'll remember who gave it.` · `A {weight} one, from me.` · `It's {weight}. And it's from me, no one else.`

### playful
- **when:** `{when}~ don't be late.` · `{when}, or I'll think of something.` · `{when}. Tick tock.`
- **cost:** `Only {slots}~` · `It'll cost you {slots}. Worth it?` · `{slots} of your time. I'll have fun with it.`
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
- **cost:** `{slots}, and every minute of it for me.` · `I need {slots} of you.` · `{slots} of your time. I'll know how you spend it.`
- **who:** `{who} will know. I'll see that they do.` · `I'll tell {who}. I'll watch them hear it.` · `{who} will know. I'll ask them later what they saw.`
- **only her:** `No one else will ever know.` · `Only me. Always only me.`
- **weight:** `It's {weight}. I thought about it a long time.` · `{weight}. I chose it carefully.` · `A {weight} one. I'll watch you take it.`

### drill
- **when:** `{when}. Move.` · `Done {when}. No excuses.` · `{when}, on the dot.`
- **cost:** `{slots}. Report when done.` · `You're on this for {slots}.` · `{slots}, starting when I say.`
- **who:** `{who} will know.` · `I'll report it to {who}.` · `{who} will see it. Look sharp.`
- **only her:** `Between you and me. Dismissed.` · `No one else. Understood?`
- **weight:** `{weight}. Take it.` · `It's {weight}. Stand up straight.` · `A {weight} one. Eyes front.`

### regal
- **when:** `You will have it done {when}.` · `{when}. I'll expect it.` · `{when}, as I wish it.`
- **cost:** `You will give me {slots}.` · `{slots} of your time, which I'm taking.` · `It asks {slots} of your time. You'll give it gladly.`
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

---

## 5. The posture call (approved by the author, 2026-11-25)

Variant **D** (author, 2026-11-25): a short full-frame moment, like the slap. Her word is her name for the posture (`{posture}`, the model's word, kept by the engine), large in her hand; her foot taps the time; the fan of her named postures rises from the dial. After the answer one line in her hand, picked as in §2 (a hash, no rng draw). Three outcomes: **right** (the right posture in time), **wrong** (another posture), **slow** (the time ran out). Without the order interaction there is no time, so only right and wrong.

### Neutral (a style with no line of its own)
- **right:** `Good.` · `Like that.` · `That's it.`
- **wrong:** `Not that. {posture}.` · `I said {posture}.` · `Wrong. {posture}.`
- **slow:** `Too slow.` · `I'm still waiting.` · `When I say it, not after.`

### affectionate
- **right:** `Good. Just like that.` · `There you are. Lovely.` · `Perfect, love.`
- **wrong:** `Not that one, love. {posture}.` · `Close. {posture}, though.` · `Mm, no. {posture}. You'll get it.`
- **slow:** `A little faster next time?` · `I'll wait. This time.` · `Slow, but you got there. Almost.`

### cold
- **right:** `Fine.` · `Acceptable.` · `Yes.`
- **wrong:** `No. {posture}.` · `{posture}. Not that.` · `Wrong.`
- **slow:** `Late.` · `Too slow.` · `I don't repeat myself.`

### ritual
- **right:** `As it should be.` · `Correct. Hold it.` · `{posture}. Properly done.`
- **wrong:** `That is not {posture}.` · `The form is {posture}. Again.` · `Wrong form. {posture}.`
- **slow:** `You missed the count.` · `On the word, not after it.` · `The moment passed. That is noted.`

### clinical
- **right:** `Correct.` · `Good. Response time acceptable.` · `That's the one.`
- **wrong:** `Incorrect. I asked for {posture}.` · `That's not {posture}. Noted.` · `Wrong posture. {posture}.`
- **slow:** `Too slow. Noted.` · `Response time: unacceptable.` · `You hesitated. I saw.`

### possessive
- **right:** `Good. Quick, the way I taught you.` · `That's how I like you.` · `Yes. Stay like that for me.`
- **wrong:** `I said {posture}. My word, not your guess.` · `Not that. {posture}, for me.` · `You know what {posture} means. Do it.`
- **slow:** `When I call, you come. Faster.` · `Too slow for me.` · `Don't make me wait. Not me.`

### playful
- **right:** `Ooh, quick~` · `Good! Gold star.` · `Look at you go.`
- **wrong:** `Nope~ {posture}.` · `Cute, but no. {posture}.` · `Wrong one! {posture}, silly.`
- **slow:** `Too slo-ow~` · `Did you fall asleep?` · `I counted. You lost.`

### cruel
- **right:** `Finally.` · `About time.` · `Good. That's all you're good for.`
- **wrong:** `Wrong. Pathetic. {posture}.` · `Can't even get {posture} right.` · `{posture}. Are you stupid?`
- **slow:** `Too slow. You'll pay for that.` · `I won't call twice.` · `Slow. As always.`

### obsessive
- **right:** `Yes. Exactly as I pictured it.` · `Perfect. Don't move.` · `There. I've been waiting for that.`
- **wrong:** `No. {posture}. You know it. I know you know it.` · `That's not {posture}. Why would you do that?` · `{posture}. I've shown you a hundred times.`
- **slow:** `I counted every second.` · `You made me wait. I noticed.` · `Too slow. I'll remember.`

### drill
- **right:** `Good.` · `Hold it. Don't move.` · `That's it. Again later.`
- **wrong:** `Wrong! {posture}!` · `{posture}, I said! Move!` · `That's not {posture}. Again!`
- **slow:** `Too slow! Again!` · `On the word! Not after!` · `Faster than that.`

### regal
- **right:** `You may stay so.` · `Better.` · `That will do.`
- **wrong:** `I asked for {posture}.` · `{posture}. Do try to keep up.` · `Not that. {posture}, as I said.`
- **slow:** `I am kept waiting.` · `When I speak, you move.` · `Too slow to please me.`

### vindictive
- **right:** `For once.` · `So you can.` · `Good. Don't expect thanks.`
- **wrong:** `Wrong. Like always. {posture}.` · `{posture}. You'd forget your own name.` · `Not {posture}. Another one for the list.`
- **slow:** `Too slow. Another one for the list.` · `You never could keep up.` · `Late. I'm not surprised.`

---

## 6. The slap (slap.html, approved by the author, 2026-11-24)

Her lines in her hand around the slap (P10e-e Task 11; `slap.html`'s `LINES`, heard in play). **before**: as the camera snaps in (ritual, drill); **feint**: the commander tensed on a feint (playful); **again**: her second slap after a turned face (cruel); **none**, **braced**, **flinched**: after the impact, by the result (a turned face is `flinched`). One line picked as in §2 (a hash, no rng draw). Cold is silent. No pronoun and no feeling for the commander.

### affectionate
- **none:** `there. it’s done.` · `shh. done.`
- **braced:** `brave.` · `look at you.`
- **flinched:** `shh. come here.` · `I know. I know.`

### cold
Silent: no line before or after.

### ritual
- **before:** `still.`
- **none:** `one.`
- **braced:** `still. as it should be.`
- **flinched:** `you moved.`

### clinical
- **none:** `noted.`
- **braced:** `no flinch. interesting.`
- **flinched:** `turned away. noted.`

### possessive
- **none:** `mine to strike.`
- **braced:** `good. mine.`
- **flinched:** `don’t you turn from me.`

### playful
- **feint:** `flinchy~`
- **none:** `didn’t see that coming?` · `ha.`
- **braced:** `ooh. ready for me?`
- **flinched:** `running away~?`

### cruel
- **again:** `again.`
- **none:** `better.`
- **braced:** `look at that.`
- **flinched:** `face me.`

### obsessive
- **none:** `you felt that. you felt me.`
- **braced:** `you were waiting for me.`
- **flinched:** `look at me. only me.`

### drill
- **before:** `chin up.`
- **none:** `eyes front.`
- **braced:** `that’s discipline.`
- **flinched:** `you turned your face. fault.`

### regal
- **none:** `you may thank me.`
- **braced:** `well taken. now thank me.`
- **flinched:** `you turn from me?`

### vindictive
- **none:** `that was owed.`
- **braced:** `it changes nothing.`
- **flinched:** `that’s added to it.`

## 7. Breathing (breath.html, tested by the author in play, 2026-11-23)

Her lines in her hand while she holds the commander's breath (P10e-e Task 14, ruling Q; `breath.html`'s `LINES`, heard in play), by her style. **entry**: as the dark comes down; **now**: as her opening comes (a false one too: the lie); **hold**: now and then after an opening; **early** / **fake**: the commander reached for a false opening (playful's own, else her early line); **tap**: her answer to the tap; **low**: once the air runs low; **greedy**: she noticed the commander holding on past her opening; **again**: playful's teasing count that ends with no opening; **released**: as she lets go at her limit; **good** / **poor**: her verdict when she is done with the commander (most openings caught or not); **stop**: after the stop word; **wake**: after a blackout. A model-written cue of that moment (her own words, from her cue pool) may take a line's place. Neutral is every style with no rows of its own; cold is silent. One line picked as in §2 (no rng draw). No pronoun and no feeling for the commander.

### neutral
- **greedy:** `let go.`
- **entry:** `breathe when I say.`
- **now:** `now.`
- **hold:** `hold it.`
- **early:** `not yet.` · `wait.`
- **tap:** `I know.`
- **low:** `hold it.`
- **good:** `good. you listened.`
- **poor:** `sloppy. we’ll do this again.`
- **released:** `breathe.`
- **stop:** `okay. I’ve got you.`
- **wake:** `there you are.`

### affectionate
- **greedy:** `easy. let go.`
- **entry:** `easy. breathe when I tell you.`
- **now:** `now, love.` · `now.`
- **hold:** `hold for me.`
- **early:** `shh. not yet.`
- **tap:** `I’ve got you.`
- **low:** `almost.`
- **good:** `so good for me.`
- **poor:** `you’re learning.`
- **released:** `breathe. I’ve got you.`
- **stop:** `okay. okay. I’m here.`
- **wake:** `hey. there you are.`

### ritual
- **greedy:** `release.`
- **entry:** `on my count.`
- **now:** `now.`
- **hold:** `hold.`
- **early:** `on the count.`
- **tap:** `noted.`
- **low:** `hold.`
- **good:** `as it should be.`
- **poor:** `again. until it’s right.`
- **released:** `breathe.`
- **stop:** `stopping.`
- **wake:** `back. good.`

### playful
- **greedy:** `so greedy~` · `greedy, greedy.`
- **entry:** `let’s see how greedy you are.`
- **now:** `now!` · `now~`
- **hold:** `hold it~`
- **early:** `ah-ah.`
- **tap:** `say please.`
- **low:** `cute.`
- **good:** `you didn’t fall for it. boring.`
- **poor:** `you fell for it every time.`
- **released:** `fine, fine. breathe.`
- **stop:** `okay. game over. I’m here.`
- **wake:** `boo. you’re back.`
- **fake:** `gotcha.` · `too eager.` · `so greedy.`
- **again:** `again.`

### cruel
- **greedy:** `greedy. now wait.`
- **entry:** `you breathe when I allow it.`
- **now:** `now.`
- **hold:** `hold it.`
- **early:** `no.`
- **tap:** `no.`
- **low:** `not yet.`
- **good:** `adequate.`
- **poor:** `pathetic.`
- **released:** `breathe. I’m not done.`
- **stop:** `fine.`
- **wake:** `awake? good.`

### possessive
- **greedy:** `you take when I give.`
- **entry:** `every breath is mine.`
- **now:** `now.`
- **hold:** `hold it for me.`
- **early:** `mine. wait.`
- **tap:** `not yet.`
- **low:** `stay with me.`
- **good:** `good. mine.`
- **poor:** `you’ll learn my rhythm.`
- **released:** `breathe. you’re still mine.`
- **stop:** `okay. I’m here.`
- **wake:** `you came back to me.`

### cold
- **greedy:** silent
- **entry:** silent
- **now:** silent
- **hold:** silent
- **early:** silent
- **tap:** silent
- **low:** silent
- **good:** silent
- **poor:** silent
- **released:** silent
- **stop:** silent
- **wake:** silent
- **fake:** silent
- **again:** silent

## 8. Weight (weight.html, approved by the author, 2026-11-23)

Her lines in her hand while she rests her weight on the commander (P10e-e Task 16, ruling Q; `weight.html`'s `LINES`), by her style. **entry**: her first words as her weight comes down, by the contact (`weight.entry.<contact>`; a contact with no row of its own: none); **announce**: a ritual holder names each shift as she telegraphs it ("shifting." or the side it goes to, "left." / "right.", as the engine's shift really goes); **slip**: the hold broke; **longer**: the first slip of a segment (the hold broke, so the engine puts her release off; a tilt is never a slip); **caught**: she felt the commander's own shift (the engine decides it at the segment's end, and the line follows it); **heavy**: she leans in heavier (her pressure rose); **released**: she got off at the commander's limit; **good** / **poor**: her verdict when she is done (most of her shifts met level, at most one slip, or not); **fall**: the commander buckled; **stop**: after the stop word. A model-written `press` cue (her own words) may take **heavy**'s place. Neutral is every style with no rows of its own; cold is silent on every kind, her first words included (Ruling R). One line picked as in §2 (no rng draw). No pronoun and no feeling for the commander.

### entry
- **human_chair:** `hold still. I’m reading.`
- **footrest:** `stay. you’re a good height.`
- **straddled:** `comfortable?`
- **standing_on:** `don’t you dare wobble.`
- **boot_on_chest:** `stay down.`

### neutral
- **released:** `enough. you’re shaking.`
- **slip:** `careful.`
- **caught:** `I felt that.`
- **heavy:** `mm. heavier.`
- **good:** `good. steady.`
- **poor:** `wobbly.`
- **fall:** `…really?`
- **stop:** `okay. up you get.`
- **longer:** `longer now.`

### affectionate
- **released:** `okay, okay. I’m off.`
- **slip:** `easy…`
- **caught:** `you can ask, you know.`
- **heavy:** `let me lean a little.`
- **good:** `you held me so well.`
- **poor:** `you’ll get stronger.`
- **fall:** `hey, hey. I’ve got you.`
- **stop:** `okay. come here.`
- **longer:** `a little longer.`

### ritual
- **released:** `released.`
- **slip:** `again.`
- **caught:** `that is not yours to take.`
- **heavy:** `bearing.`
- **good:** `as it should be.`
- **poor:** `again tomorrow.`
- **fall:** `down. noted.`
- **stop:** `stopping.`
- **longer:** `longer.`
- **announce:** `shifting.` · `left.` · `right.`

### playful
- **released:** `fine, you win. this time.`
- **slip:** `oops~`
- **caught:** `cheater~`
- **heavy:** `boop. heavier.`
- **good:** `boring. you didn’t fall once.`
- **poor:** `you fell for every one.`
- **fall:** `timber!`
- **stop:** `fine, fine. up.`
- **longer:** `ooh, overtime.`

### clinical
- **released:** `limit reached. noted.`
- **slip:** `noted.`
- **caught:** `unauthorised shift. noted.`
- **heavy:** `load increased.`
- **good:** `acceptable variance.`
- **poor:** `reaction time: poor.`
- **fall:** `failure point reached.`
- **stop:** `session ended.`
- **longer:** `extending.`

### cruel
- **released:** `barely. get up.`
- **slip:** `pathetic.`
- **caught:** `did I say you could move?`
- **heavy:** `heavier.`
- **good:** `adequate.`
- **poor:** `useless.`
- **fall:** `get up. we’re not done.`
- **stop:** `fine.`
- **longer:** `longer. you earned it.`

### cold
- **released:** silent
- **slip:** silent
- **caught:** silent
- **heavy:** silent
- **good:** silent
- **poor:** silent
- **fall:** silent
- **stop:** silent
- **longer:** silent
- **announce:** silent
- **entry.human_chair:** silent
- **entry.footrest:** silent
- **entry.straddled:** silent
- **entry.standing_on:** silent
- **entry.boot_on_chest:** silent
