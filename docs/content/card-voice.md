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

### regal
- **slip:** `steady.`
- **heavy:** `I’ll lean back.`
- **fall:** `a pity. I’ll find a sturdier seat.`

## 9. Scent (saturation.html, approved by the author, 2026-11-23)

Her lines in her hand while the commander breathes her in (P10e-e Task 18, ruling Q; `saturation.html`'s `LINES`, her question's words of its `STYLES[].ask` and what her rule says is missing, `judge`). **entry**: her first words as she settles, by the contact (`scent.entry.<contact>`); **here**: her named places by the contact, in order (`scent.here.<contact>`: feet_on_face toes, arch, heel, the ball; face_to_bottom the centre, her side; smothered_armpit the hollow, the edge); **deeper** / **gently** / **still**: her orders; **moved**: playful moves her mark; **good** / **bad**: an order kept or not; **mouth**: she heard a mouth breath (the engine caught it), by her style; **away**: the face turned from her while she watches; **cough**: the body revolted; **liar**: the cough gave a lie away; **caught**: she saw the commander seek her out; **lost.low** / **lost.high**: the head overflowed (by the commander's stage); **need**: the body breathes by itself; **end** / **stop**: the end, after the stop word; **ask**: her question (`{p}` is her place in her own words, lower case as she writes); **answer.ok** / **answer.bad** / **answer.empty**: her verdict, which follows the answer the engine records; **miss.***: what her rule found missing (warm; admit; bad and want; the place, the strength and the band; the intensity wrong or missing, and honest). Neutral is every style with no rows of its own; cold is silent on every kind, her first words included (Ruling R). No pronoun for the commander.

### entry
- **feet_on_face:** `breathe me in.`
- **face_to_bottom:** `stay right there. breathe.`
- **smothered_armpit:** `nose in. all the way.`

### here
- **feet_on_face:** `between my toes.` · `the arch.` · `the heel.` · `under my toes.`
- **face_to_bottom:** `closer.` · `my hip.`
- **smothered_armpit:** `deeper in.` · `my side.`

### neutral
- **deeper:** `deeper.` · `more than that.` · `all of it.`
- **gently:** `slowly.` · `gently.`
- **still:** `don’t move.` · `stay still.`
- **moved:** `no, here.` · `over here now~`
- **good:** `good.` · `mm. like that.`
- **bad:** `I said deeper.` · `that’s not what I asked.`
- **away:** `don’t you dare turn away.`
- **cough:** `too much for you?` · `breathe it, don’t fight it.`
- **liar:** `liar.`
- **caught:** `you like that, don’t you.`
- **need:** `breathe.`
- **end:** `enough. for now.`
- **stop:** `okay. come up.`
- **lost.low:** `too much?`
- **lost.high:** `good. stay there.`
- **answer.empty:** `nothing? then smell it properly.`
- **miss.warm:** `you didn’t say where. or how it is now.`
- **miss.admit:** `liar~ it’s strong. say it.`
- **miss.bad:** `say how bad it is.`
- **miss.want:** `and you want it. say it.`
- **miss.place:** `where? the place.`
- **miss.strength:** `how strong? say it.`
- **miss.band:** `that’s not how strong it is.`
- **miss.intensity_wrong:** `intensity: wrong.`
- **miss.intensity_missing:** `intensity: missing.`
- **miss.honest:** `and what you feel. honestly.`
- **mouth:** `through your nose.`
- **answer.ok:** `good answer.`
- **answer.bad:** `that’s not what I asked.`
- **ask:** `{p}. what do you smell?` · `tell me about {p}.`

### affectionate
- **mouth:** silent
- **answer.ok:** `thank you for telling me.`
- **answer.bad:** `it’s okay. breathe.`
- **ask:** `{p}, love. how is it?` · `tell me about {p}. anything.`

### playful
- **mouth:** `caught you~`
- **answer.ok:** `ha. honest.`
- **answer.bad:** `liar~ prove it.`
- **ask:** `be honest~ {p}: strong?` · `{p}. how bad? tell me~`

### cruel
- **mouth:** `did I say you could?`
- **answer.ok:** `good. remember that.`
- **answer.bad:** `wrong. smell it properly.`
- **ask:** `{p}. tell me how bad it is. and what you want.` · `{p}. how does it smell? and what do you want?`

### ritual
- **mouth:** `not without permission.`
- **answer.ok:** `correct.`
- **answer.bad:** `incorrect. again.`
- **ask:** `{p}. where, and how strong?`

### clinical
- **mouth:** `mouth breathing. noted.`
- **answer.ok:** `accurate.`
- **answer.bad:** `imprecise.`
- **ask:** `report on {p}: intensity, and what you feel.`

### cold
- **deeper:** silent
- **gently:** silent
- **still:** silent
- **moved:** silent
- **good:** silent
- **bad:** silent
- **away:** silent
- **cough:** silent
- **liar:** silent
- **caught:** silent
- **need:** silent
- **end:** silent
- **stop:** silent
- **lost.low:** silent
- **lost.high:** silent
- **answer.empty:** silent
- **miss.warm:** silent
- **miss.admit:** silent
- **miss.bad:** silent
- **miss.want:** silent
- **miss.place:** silent
- **miss.strength:** silent
- **miss.band:** silent
- **miss.intensity_wrong:** silent
- **miss.intensity_missing:** silent
- **miss.honest:** silent
- **mouth:** silent
- **answer.ok:** silent
- **answer.bad:** silent
- **ask:** silent
- **entry.feet_on_face:** silent
- **here.feet_on_face:** silent
- **entry.face_to_bottom:** silent
- **here.face_to_bottom:** silent
- **entry.smothered_armpit:** silent
- **here.smothered_armpit:** silent

## 10. Jaw (jaw.html, approved by the author, 2026-11-24)

Her lines in her hand while the commander's jaw is held open (P10e-e Task 20, ruling Q; `jaw.html`'s `LINES`). **entry**: her first words, by what holds the mouth open (`jaw.entry.<contact>`: her toes, `sole_to_mouth`; the ring, `ring_gag`, which any item worn in the mouth reads as); **teeth**: the teeth touched her; **deeper** / **suck** / **wide** / **out**: her orders and her pulling back (the cue kinds `deeper`, `suck`, `wider`, `pull_back`: a line the model words for that moment takes their place); **correct**: an order not kept; **restOk** / **restNo**: her answer to a rest asked for, which follows the engine's (granted unless cruel or vindictive); **ask**: her question through the ring, `question|word` when she wants a word said (no word: any answer); **heard** / **lost**: she understood the line or not; **end**: the end; **slack**: the rest is over, or a line said with her toes in the mouth; **stop**: after the stop word. Neutral is every style with no rows of its own; cold is silent on every kind, her first words included (Ruling R). No pronoun for the commander.

### entry
- **sole_to_mouth:** `open.`
- **ring_gag:** `there. keep it open.`

### neutral
- **teeth:** `teeth.` · `careful.`
- **deeper:** `deeper.`
- **out:** `easy.`
- **suck:** `suck.`
- **wide:** `wider. show me.`
- **correct:** `I said wider.` · `keep it there.`
- **restOk:** `fine. rest.`
- **restNo:** `not yet.`
- **ask:** `anything to say?`
- **heard:** `good.`
- **lost:** `what was that?`
- **end:** `that’s enough.`
- **slack:** `don’t let it close.`
- **stop:** `okay. it’s out. I’m here.`

### affectionate
- **entry.sole_to_mouth:** `open for me.`
- **entry.ring_gag:** `shh. just keep it open for me.`
- **teeth:** `ow — gently.`
- **deeper:** `a little more.`
- **out:** `there.`
- **suck:** `gently. suck.`
- **wide:** `wider, love.`
- **correct:** `a little wider.`
- **restOk:** `rest. I’ve got you.`
- **restNo:** silent
- **ask:** `tell me how it feels.` · `say yes.|yes`
- **heard:** `I know.` · `good.`
- **lost:** `shh, I can’t tell.`
- **end:** `all done. close.`
- **slack:** `stay open for me.`
- **stop:** `okay. it’s out. I’m here.`

### ritual
- **entry.sole_to_mouth:** `open.`
- **entry.ring_gag:** `open. hold.`
- **teeth:** `teeth. again.`
- **deeper:** `deeper.`
- **out:** `back.`
- **suck:** `suck.`
- **wide:** `wide.`
- **correct:** `the form.`
- **restOk:** `rest. count of four.`
- **restNo:** silent
- **ask:** `repeat: yes.|yes`
- **heard:** `correct.`
- **lost:** `again. clearly.`
- **end:** `close.`
- **slack:** `the form.`
- **stop:** `okay. it’s out. I’m here.`

### playful
- **entry.sole_to_mouth:** `say aah~`
- **entry.ring_gag:** `cute. now talk to me~`
- **teeth:** `hey! no biting~`
- **deeper:** `more~`
- **out:** `aww.`
- **suck:** `suck~`
- **wide:** `wiiider~`
- **correct:** `wider, I said~`
- **restOk:** `fine, fine.`
- **restNo:** silent
- **ask:** `say please~|please` · `say my name~`
- **heard:** `ha, close enough.`
- **lost:** `what? I can’t understand you~`
- **end:** `okay, you can close~`
- **slack:** `nope, keep it open~`
- **stop:** `okay. it’s out. I’m here.`

### cruel
- **entry.sole_to_mouth:** `open.`
- **entry.ring_gag:** `now you can’t close it.`
- **teeth:** `teeth? really?` · `teeth.`
- **deeper:** `deeper.`
- **out:** `hm.`
- **suck:** `suck.`
- **wide:** `wide.`
- **correct:** `wider.`
- **restOk:** silent
- **restNo:** `no.` · `earn it.`
- **ask:** `say please.|please` · `beg.|please`
- **heard:** `pathetic.`
- **lost:** `speak properly.` · `I can’t hear you.`
- **end:** `you may close it.`
- **slack:** `open.`
- **stop:** `okay. it’s out. I’m here.`

### possessive
- **entry.sole_to_mouth:** `open. it’s mine.`
- **entry.ring_gag:** `your mouth is mine now.`
- **teeth:** `careful with what’s mine.`
- **deeper:** `all of it.`
- **out:** `there.`
- **suck:** `suck.`
- **wide:** `wider for me.`
- **correct:** `for me. wider.`
- **restOk:** `rest. then again.`
- **restNo:** silent
- **ask:** `whose mouth is it?|yours` · `say mine.|yours`
- **heard:** `good. mine.`
- **lost:** `again. I want to hear it.`
- **end:** `close. good.`
- **slack:** `mine stays open.`
- **stop:** `okay. it’s out. I’m here.`

### vindictive
- **entry.sole_to_mouth:** `open.`
- **entry.ring_gag:** `keep it open. you owe me that.`
- **teeth:** `that’s added.`
- **deeper:** `deeper.`
- **out:** `hm.`
- **suck:** `suck.`
- **wide:** `wide.`
- **correct:** `wider. that’s added.`
- **restOk:** silent
- **restNo:** `no rest owed.`
- **ask:** `say sorry.|sorry`
- **heard:** `not enough.`
- **lost:** `that’s added.`
- **end:** `close it.`
- **slack:** `open.`
- **stop:** `okay. it’s out. I’m here.`

### clinical
- **entry.sole_to_mouth:** `open.`
- **entry.ring_gag:** `ring fitted. hold.`
- **teeth:** `teeth contact. noted.`
- **deeper:** `deeper.`
- **out:** `back.`
- **suck:** `suck. lighter.`
- **wide:** `maximum.`
- **correct:** `the angle.`
- **restOk:** `four seconds.`
- **restNo:** silent
- **ask:** `count to three.|three`
- **heard:** `legible.`
- **lost:** `illegible. again.`
- **end:** `done.`
- **slack:** `maintain.`
- **stop:** `okay. it’s out. I’m here.`

### cold
- **teeth:** silent
- **deeper:** silent
- **out:** silent
- **suck:** silent
- **wide:** silent
- **correct:** silent
- **restOk:** silent
- **restNo:** silent
- **ask:** silent
- **heard:** silent
- **lost:** silent
- **end:** silent
- **slack:** silent
- **stop:** silent
- **entry.sole_to_mouth:** silent
- **entry.ring_gag:** silent

## 11. Her activity (her_activity.html, approved by the author, 2026-11-23)

Her lines in her hand in the frame of her time (P10e-e Task 24, ruling Q; `her_activity.html`'s `STYLES`). **name**: her name for the commander (the sign that a line is for the commander); **noticed**: she caught a movement (at `with`, and at `glancing` most of the time); **correct**: a correction; **call**: what she calls the commander to someone else; **end**: her end line (`with`, `glancing`); **askReply**: an answer to her question was given; **breach**: the commander answered words not meant for the commander; **silent**: her question was left unanswered; **stop**: after the stop word; **rest**: she lets the commander rest under her weight (her_activity.html `W_LINES[].rest`); **fall**: her verdict at the third buckle (`W_FALL`). Her spoken words that the prototype writes inline (final review, Minor 3; every style reads these neutral rows): **woke**, waking at `with` / `glancing` (**wokeMumble** elsewhere); **comeIn**, to a visitor's knock; **stay**, after her entry when she keeps the commander; **entry.floor**, her order in the floor view's entry (the gesture is the sensory line). Neutral is every style with no rows of its own (Ruling R); the prototype has cold's own rows. No pronoun for the commander.

### neutral
- **name:** `commander`
- **noticed:** `still.` · `stop fidgeting.`
- **correct:** `still.`
- **call:** `the chair.`
- **end:** `done. you can get up.`
- **askReply:** `good.` · `mm.`
- **breach:** `I wasn’t talking to you.`
- **silent:** `I asked you something.`
- **stop:** `okay. up you get.` · `alright. stopping.` · `enough. up.`
- **fall:** `…really? enough.`
- **rest:** `rest. a moment.`
- **woke:** `…what are you doing.`
- **wokeMumble:** `…`
- **comeIn:** `come in.`
- **stay:** `Stay.`
- **entry.floor:** `Down. Eyes down.`

### affectionate
- **name:** `sweetheart`
- **noticed:** `shh. you’re alright.` · `need a moment?`
- **correct:** `easy…`
- **call:** `the cat.`
- **end:** `come here. you did so well.`
- **askReply:** `good.` · `thank you.`
- **breach:** `hm? oh, not you, sweetheart.`
- **silent:** `…sweetheart?`
- **fall:** `hey, hey. that’s enough for tonight.`
- **rest:** `here. rest a moment.`

### clinical
- **name:** `subject`
- **noticed:** `movement. noted.` · `again. noted.`
- **correct:** `posture.`
- **call:** `the subject.`
- **end:** `session over. noted: everything.`
- **askReply:** `noted.`
- **breach:** `unsolicited. noted.`
- **silent:** `no response. noted.`
- **fall:** `failure point reached. session over.`
- **rest:** `recovery interval.`

### cold
- **name:** `you`
- **noticed:** `don’t.`
- **correct:** `…`
- **call:** `the furniture.`
- **end:** `go.`
- **askReply:** `fine.`
- **breach:** `not you.`
- **silent:** `I asked.`
- **fall:** `get up. go.`

### cruel
- **name:** `chair`
- **noticed:** `did I say move?` · `pathetic.`
- **correct:** `still, chair.`
- **call:** `my chair. it creaks today.`
- **end:** `get up. we’re not done tomorrow.`
- **askReply:** `adequate.`
- **breach:** `chairs don’t talk.`
- **silent:** `chair. I asked you something.`
- **fall:** `useless. get out of my sight.`
- **rest:** `…fine. a moment.`

### playful
- **name:** `pet`
- **noticed:** `fidgety~` · `I saw that~`
- **correct:** `tsk.`
- **call:** `my footrest. it wobbles.`
- **end:** `fine, fine. up you get~`
- **askReply:** `good pet.` · `cute.`
- **breach:** `who said you could talk~`
- **silent:** `ignoring me? bold.`
- **fall:** `timber! okay, you’re done.`
- **rest:** `fine, a break~`

### possessive
- **name:** `mine`
- **noticed:** `don’t.` · `you stay where I put you.`
- **correct:** `mine. still.`
- **call:** `what’s mine.`
- **end:** `up. you’re mine again tomorrow.`
- **askReply:** `good.` · `of course.`
- **breach:** `did I talk to you?`
- **silent:** `answer me.`
- **fall:** `enough. you’ll do better for me.`

### regal
- **name:** `my seat`
- **noticed:** `steady.` · `a seat does not fidget.`
- **correct:** `steady.`
- **call:** `my seat.`
- **end:** `you may get up.`
- **askReply:** `acceptable.` · `good.`
- **breach:** `I was not speaking to you.`
- **silent:** `I asked you a question.`
- **fall:** `a pity. I’ll find a sturdier seat.`
- **rest:** `rest. briefly.`

### ritual
- **name:** `kneeler`
- **noticed:** `posture.`
- **correct:** `posture.`
- **call:** `the kneeler.`
- **end:** `released.`
- **askReply:** `as it should be.`
- **breach:** `you were not addressed.`
- **silent:** `you were addressed.`
- **fall:** `down. noted. we stop.`
- **rest:** `rest.`


Her placeholder lines (Ruling Z, her_activity.html `ACTS[].self`, `TO_YOU`, `CALL`, `VISIT`, `CARDS`): her own words until the script of her hour arrives, and whenever it fails; by activity (`any` for every one); the exchanges (`exchange.call`, `exchange.visit`, `exchange.cards`) are `other|her`, a mention `other|plain|veiled`.

### neutral
- **self.reading_book:** `hm.` · `no. no, no, no…` · `oh, come on.` · `there it is.` · `idiot.` · `mm.` · `don’t open that door…` · `of course she did.`
- **self.reading_reports:** `…three wounded. three.` · `the commander authorized the detour. hm.` · `that’s not what she told me.` · `requisition denied. again.` · `node four. why node four.` · `who signs these.`
- **self.writing_report:** `…“regrettably”. no.` · `how do I say this without saying it.` · `losses: acceptable. sure.` · `mm. delete.`
- **self.chatting_on_pda:** `ha.` · `no way.` · `she did not.` · `oh, you’re in trouble.`
- **self.sleeping:** `…mm.` · `…no…` · `…stay…`
- **self.music:** `~ mm-mm, mm ~` · `~ da, da-da ~`
- **self.cleaning_weapon:** `there you are.` · `filthy.` · `who had you last.`
- **self.mending_clothes:** `ow.` · `there.` · `hm-mm.`
- **self.drinking:** `mm. better.` · `to me.` · `one more.` · `why is this so good.`
- **self.sketching:** `no. the jaw’s wrong.` · `hold still.` · `better.`
- **self.holding_audience:** `next.` · `who else.` · `they all want something.` · `hm. that one can wait.`
- **toYou.any:** `you’re quiet. good.`
- **toYou.reading_book:** `this one’s good. you’d hate it.`
- **toYou.reading_reports:** `listen: “the commander’s conduct was… adequate.” hm.`
- **toYou.sketching:** `don’t move. I’m doing your hands.` · `turn your head. no. back.`
- **toYou.drinking:** `you want some? no. you don’t.`
- **toYou.chatting_on_pda:** `{name} says hi. don’t answer.` (the prototype's placeholder friend, Vex, is a real soldier of the squad outside the scene; with none, the line is not said)
- **ask.any:** `what time is it, do you think?` · `still with me down there?`
- **ask.reading_book:** `guess who did it.`
- **ask.reading_reports:** `did you sign the detour at node four?`
- **ask.writing_report:** `how do you spell “negligible”?`
- **ask.drinking:** `tell me something. anything.`
- **ask.cleaning_weapon:** `you ever field-strip one of these?`
- **ask.mending_clothes:** `whose shirt is this, you think?`
- **exchange.call:** `Unit status, please.|Operational. Two on light duty.` · `The detour at node four. Whose call?|The commander’s. I’d have made the same one.` · `And the requisition?|Denied. Again. Send it up.` · `You sound distracted.|I have my feet up on something comfortable.|long day. go on.` · `Understood. Anything else?|No. Out.`
- **exchange.visit:** `Got a minute? The roster for tomorrow.|Leave it on the desk.` · `Has anyone seen the commander? Nobody can find…|closer than you think.|no idea. try the comms room.` · `Right. Night, then.|night.`
- **exchange.cards:** `Your deal.|watch and learn.` · `You’re cheating.|prove it.` · `How’s your furniture holding up?|quiet. for once.|the chair? it’s fine.` · `Raise.|call.` · `Ugh. Again.|again.`
- **exchange.heard_call:** `…is someone with you?|just my footrest.|no. the heater ticks.`
- **exchange.heard_visit:** `…what was that?|my footrest. it creaks.|the chair. it’s old.`

## 12. The throne (throne.html, approved by the author, 2026-11-25)

Her lines on the throne (P10e-e Task 24b; `throne.html`'s `T_LINES`). **spill**: her mug spilled on the commander's back; **skid**: the pen skidded while she signed; **thank**: she has the commander thank her for the seat (at `with` or `glancing`); **thanked** / **noThanks**: her answer. Neutral is every style with no rows of its own. No pronoun for the commander.

### neutral
- **spill:** `…look what you did.`
- **skid:** `hold still. again.`
- **thank:** `say thank you for the seat.`
- **thanked:** `good.`
- **noThanks:** `nothing? noted.`

### affectionate
- **spill:** `oh — it’s alright. hold still.`
- **skid:** `still, please. once more.`
- **thank:** `say thank you. for letting me sit.`
- **thanked:** `good. up you get.`
- **noThanks:** `…next time, then.`

### clinical
- **spill:** `spillage. noted.`
- **skid:** `the writing surface moved.`
- **thank:** `acknowledge it.`
- **thanked:** `noted.`
- **noThanks:** `no response. noted.`

### cold
- **spill:** `clumsy.`
- **skid:** `again.`
- **thank:** `thank me.`
- **thanked:** `fine.`
- **noThanks:** `noted.`

### cruel
- **spill:** `you’ll lick that up later.`
- **skid:** `a desk doesn’t move.`
- **thank:** `thank me.`
- **thanked:** `…fine.`
- **noThanks:** `you’ll learn.`

### playful
- **spill:** `oops~ that’s on you.`
- **skid:** `you made me scribble~`
- **thank:** `what do we say~?`
- **thanked:** `cute.`
- **noThanks:** `rude~`

### possessive
- **spill:** `careful with my things.`
- **skid:** `still. you’re mine to write on.`
- **thank:** `thank me for using you.`
- **thanked:** `good.`
- **noThanks:** `we’ll work on that.`

### regal
- **spill:** `you spilled my tea.`
- **skid:** `a desk does not move. again.`
- **thank:** `thank me for the honor of my weight.`
- **thanked:** `you may.`
- **noThanks:** `how ungrateful.`

### ritual
- **spill:** `you spilled. that is noted.`
- **skid:** `the signature is ruined. again.`
- **thank:** `thank me for the honor.`
- **thanked:** `accepted.`
- **noThanks:** `the form was not kept.`


## 13. Foot service (her_activity.html, the game inside `service`, approved by the author, 2026-11-24)

Kinds `service.good` / `service.poor` (her line at the end of a bout by its quality, `q ≥ 0.6` good) and `service.wrong` (a misread or unanswered signal), said only at `with` and `glancing`; a style not listed reads neutral's. Her words for the zones are `service.zone.<zone>` (no style, under **zones** below); her check composes "<zone>. <missed>." (`service.missed`, neutral for every style). The first time she gives a signal she names it (`<motion's words> — <meaning>.`, the prototype's `MOTIONS` / `MEANINGS`, in the instrument).

### neutral
- **good:** `good.` / `mm. better.`
- **poor:** `sloppy.` / `again, properly.`
- **wrong:** `no.`
- **missed:** `you missed it.`

### affectionate
- **good:** `that’s lovely.` / `perfect.`
- **poor:** `gentler, sweetheart.`
- **wrong:** `not that, silly.`

### playful
- **good:** `ooh, good pet~`
- **poor:** `you call that service?`
- **wrong:** `wrong~`

### possessive
- **good:** `good. mine.`
- **poor:** `you’ll do it right for me.`
- **wrong:** `no. listen.`

### cold
- **good:** `fine.`
- **poor:** `no.`
- **wrong:** `wrong.`

### cruel
- **good:** `adequate.`
- **poor:** `pathetic. again.`
- **wrong:** `can’t you read?`

### clinical
- **good:** `acceptable.`
- **poor:** `below standard. noted.`
- **wrong:** `incorrect response. noted.`

### ritual
- **good:** `as it should be.`
- **poor:** `again.`
- **wrong:** `that is not what was asked.`

### zones
- **toes:** `toes.`
- **ball:** `the ball.`
- **arch:** `the arch.`
- **heel:** `heel.`
- **edge:** `the edge.`

## 14. Shoe service (shoe.html, approved by the author, 2026-11-24)

Kinds `shoe.<kind>` by her style (shoe.html `LINES`, verbatim): her first words (`entry`), turning her foot (`turn`), presenting the sole (`sole`), asking for a kiss (`kiss`), her first wish for a shine (`polish`), changing feet (`other`), a spit she saw (`caught`), a swallow (`swallowed`), her verdict on a surface (`good` / `poor`, or the worst zone: `missed` over 0.2 of dirt, `dull` under 0.35 of shine; `%z` is her word for the zone), a stamp after a poor surface (`stamp`) and her end (`end`); `stop` is her line after the stop word (the prototype's `finish('stop')`). A style not listed reads neutral's (Ruling R); cold has the prototype's own lines (silent where it has none). Her words for the zones are `shoe.zone.<zone>` (no style, under **zones** below).

### neutral
- **entry:** `clean them.`
- **turn:** `the other side.`
- **sole:** `underneath.`
- **kiss:** `kiss it.`
- **polish:** `now make it shine.`
- **other:** `now the other one.`
- **caught:** `did you just spit?`
- **swallowed:** `swallow it.`
- **good:** `good.`
- **poor:** `sloppy.`
- **missed:** `%z. you missed it.`
- **dull:** `%z is dull.`
- **stamp:** `properly.`
- **end:** `that will do.`
- **stop:** `okay. stop. come here.`

### affectionate
- **entry:** `would you? they’re filthy.`
- **turn:** `and this side, love.`
- **sole:** `underneath too.`
- **kiss:** `kiss it for me.`
- **polish:** `make them pretty.`
- **other:** `the other one, please.`
- **caught:** `hey. I saw that.`
- **swallowed:** `there you go.`
- **good:** `they look lovely.`
- **poor:** `nearly, sweetheart.`
- **missed:** `you missed %z.`
- **dull:** `%z could shine more.`
- **stamp:** silent
- **end:** `thank you. really.`

### ritual
- **entry:** `begin with the toe.`
- **turn:** `the inner side.`
- **sole:** `the sole.`
- **kiss:** `kiss the toe.`
- **polish:** `polish.`
- **other:** `the left.`
- **caught:** `you spat. again.`
- **swallowed:** `swallow.`
- **good:** `as it should be.`
- **poor:** `again.`
- **missed:** `%z.`
- **dull:** `%z. it is dull.`
- **stamp:** `the form.`
- **end:** `enough. kiss them both.`

### playful
- **entry:** `look what I stepped in~`
- **turn:** `other side~`
- **sole:** `tada~ underneath.`
- **kiss:** `kiss~`
- **polish:** `make them sparkle~`
- **other:** `and the other one~`
- **caught:** `eww. spitting? naughty.`
- **swallowed:** `yummy?`
- **good:** `ooh, shiny.`
- **poor:** `hmm, meh.`
- **missed:** `you missed a spot~ %z.`
- **dull:** `%z is so dull~`
- **stamp:** `faster~`
- **end:** `okay okay, good pet.`

### cruel
- **entry:** `clean.`
- **turn:** `other side.`
- **sole:** `the sole. all of it.`
- **kiss:** `kiss it.`
- **polish:** `shine it.`
- **other:** `other foot.`
- **caught:** `you spat it out? lick it back up.`
- **swallowed:** `swallow.`
- **good:** `adequate.`
- **poor:** `pathetic.`
- **missed:** `%z. you call that clean?`
- **dull:** `%z. dull. again.`
- **stamp:** `faster.`
- **end:** `get away from my feet.`

### possessive
- **entry:** `my boots. clean them.`
- **turn:** `this side too.`
- **sole:** `underneath. mine all over.`
- **kiss:** `kiss it. it’s mine.`
- **polish:** `make them shine for me.`
- **other:** `now the other.`
- **caught:** `you don’t waste what’s mine.`
- **swallowed:** `all of it. good.`
- **good:** `good. mine.`
- **poor:** `you’ll do better for me.`
- **missed:** `%z.`
- **dull:** `%z. dull.`
- **stamp:** `for me. properly.`
- **end:** `good. stay there.`

### cold
- **entry:** `clean them.`
- **turn:** `turn.`
- **sole:** `sole.`
- **kiss:** `kiss.`
- **polish:** `shine.`
- **other:** `other.`
- **caught:** `you spat.`
- **swallowed:** silent
- **good:** `fine.`
- **poor:** `no.`
- **missed:** `%z.`
- **dull:** `%z.`
- **stamp:** silent
- **end:** `done.`

### regal
- **entry:** `my boots need you.`
- **turn:** `the other side, if you please.`
- **sole:** `and beneath.`
- **kiss:** `kiss them. you may.`
- **polish:** `I want to see myself in them.`
- **other:** `now the other.`
- **caught:** `you spat at my feet?`
- **swallowed:** `swallow it. graciously.`
- **good:** `worthy.`
- **poor:** `unworthy.`
- **missed:** `%z. look again.`
- **dull:** `%z does not shine.`
- **stamp:** `I am waiting.`
- **end:** `you may thank me.`

### zones
- **toe:** `the toe`
- **vamp:** `the top`
- **laces:** `the laces`
- **side:** `the side`
- **heel:** `the heel`
- **shaft:** `the shaft`
- **welt:** `the welt`
- **back:** `the back`
- **toe_tread:** `the tread`
- **mid:** `the middle of the sole`
- **heel_tread:** `the heel underneath`

## 15. Gulp (gulp.html, approved by the author, 2026-11-25)

Kinds `gulp.<kind>` by her style (gulp.html `LINES`, verbatim): her first words (`entry`), her word as a surge comes (`surge`, ritual only; the model may word its own for the cue `surge`), her answer to a tap when she keeps the commander (`tapped`), a spill (`spill`), a cough (`cough`), her flow's end (`done`), what was spilled (`clean`: she makes the commander clean it, or affectionate wipes it up herself), her check of the floor (`cleaned`, or `missed` over 15 % left); `stop` is her line after the stop word (the prototype's inline one). A style not listed reads neutral's (Ruling R); cold has the prototype's own lines (silent where it has none).

### neutral
- **entry:** `open. drink.`
- **surge:** silent
- **tapped:** `slower, then.`
- **spill:** `careful.`
- **cough:** `breathe.`
- **done:** `all of it. good.`
- **clean:** `you spilled. clean it.`
- **cleaned:** `good.`
- **missed:** `there. you missed it.`
- **stop:** `okay. stop. here.`

### affectionate
- **entry:** `shh. drink for me.`
- **surge:** silent
- **tapped:** `okay, okay. I’ll wait.`
- **spill:** `it’s alright.`
- **cough:** `easy. breathe.`
- **done:** `good. so good.`
- **clean:** `leave it, I’ll get it.`
- **cleaned:** silent
- **missed:** silent

### ritual
- **entry:** `open. drink.`
- **surge:** `now.`
- **tapped:** `hold.`
- **spill:** `a spill.`
- **cough:** `compose yourself.`
- **done:** `finished.`
- **clean:** `the floor. with your tongue.`
- **cleaned:** `as it should be.`
- **missed:** `there. again.`

### playful
- **entry:** `say ahh~`
- **surge:** silent
- **tapped:** `slower? hmm. no~`
- **spill:** `oops~`
- **cough:** `too much?`
- **done:** `all gone~`
- **clean:** `look at that mess. lick it up~`
- **cleaned:** `shiny.`
- **missed:** `you missed a spot~`

### cruel
- **entry:** `drink.`
- **surge:** silent
- **tapped:** `you don’t ask.`
- **spill:** `wasteful.`
- **cough:** `pathetic.`
- **done:** `all of it. good.`
- **clean:** `lick it up.`
- **cleaned:** `adequate.`
- **missed:** `there. all of it.`

### possessive
- **entry:** `drink. all of it is yours.`
- **surge:** silent
- **tapped:** `a little slower. for you.`
- **spill:** `that was yours.`
- **cough:** `breathe. then more.`
- **done:** `good. mine.`
- **clean:** `you don’t waste me. clean it.`
- **cleaned:** `good.`
- **missed:** `all of it.`

### cold
- **entry:** `drink.`
- **surge:** silent
- **tapped:** silent
- **spill:** silent
- **cough:** silent
- **done:** `done.`
- **clean:** `clean it.`
- **cleaned:** `fine.`
- **missed:** `there.`

## 16. The game of postures (posture.html, approved by the author, 2026-11-27)

Kinds `posture.<kind>` by her style (posture.html `LINES`, verbatim): her first words when the hold begins (`start`), that she is watching (`watch`), a correction she saw (`fidget`), a point that slipped (`slip`), the eyes that rose (`gaze`), her release (`release`; `clean` when nothing slipped and nothing was seen), her word before a call in scheme C (`prefix`, one line; silent: she says none), the call's answers (`taken`, `wrong`, `late`), "look at me" (`look`), what she says once the eyes are down again (`down`), and the order not obeyed (`notLooking`). A style not listed reads neutral's (Ruling R); cold says nothing where it is silent. The prototype's `cruel` `clean` and `taken` and `regal` `watch` are empty lines, which it reads as neutral's: they have no row here, and neutral's lines play.

### neutral
- **start:** `Like this. Hold it.` `Stay like that.`
- **watch:** `I'm watching.` `Mm.`
- **fidget:** `Stop fidgeting.` `Still.`
- **slip:** `Fix it.` `That's not what I asked for.`
- **gaze:** `Eyes down.` `Did I say you could look?`
- **release:** `Enough. Up.` `Good. You can stop.`
- **clean:** `Better than last time.`
- **prefix:** `Now —`
- **taken:** `Good.`
- **wrong:** `No.`
- **late:** `Too slow.`
- **look:** `Look at me.`
- **down:** `Down.`
- **notLooking:** `I said look at me.`

### ritual
- **start:** `Position.` `Assume it. Properly.`
- **watch:** `I see every line of you.`
- **fidget:** `A correction is not a twitch.`
- **slip:** `Again. From the beginning.`
- **gaze:** `Eyes.`
- **release:** `Released.`
- **clean:** `Correct.`
- **prefix:** `Position:`
- **taken:** `Correct.`
- **wrong:** `That is not the form.`
- **late:** `Late.`
- **look:** `Look at me.`
- **down:** `Lower them.`
- **notLooking:** `When I tell you to look, you look.`

### drill
- **start:** `Hold. I'm timing it.` `On my clock.`
- **watch:** `Thirty more.` `Don't you dare.`
- **fidget:** `I saw that.`
- **slip:** `Reset. Clock starts again.`
- **gaze:** `Eyes on the floor, recruit.`
- **release:** `Time. Up.`
- **clean:** `Norm met.`
- **prefix:** `On my word —`
- **taken:** `Next.`
- **wrong:** `Wrong. Again.`
- **late:** `Too slow. Again.`
- **look:** `Look at me.`
- **down:** `Floor.`
- **notLooking:** `Eyes on me. Now.`

### cold
- **start:** `There.`
- **watch:** silent
- **fidget:** silent
- **slip:** `Hm.`
- **gaze:** silent
- **release:** `That will do.`
- **clean:** silent
- **prefix:** silent
- **taken:** silent
- **wrong:** `No.`
- **late:** silent
- **look:** `Look at me.`
- **down:** silent

### playful
- **start:** `Let's see how long you last.` `Pretty. Now don't move.`
- **watch:** `I can see you wobbling.`
- **fidget:** `Ooh, a twitch.`
- **slip:** `Caught you.`
- **gaze:** `Peeking?`
- **release:** `Alright, alright. Up.`
- **clean:** `Look at you.`
- **prefix:** `Simon says —`
- **taken:** `Cute.`
- **wrong:** `Nope!`
- **late:** `Sloooow.`
- **look:** `Look at me.`
- **down:** `Gotcha. Down.`
- **notLooking:** `Hey. Up here.`

### cruel
- **start:** `Hold it until I get bored.`
- **watch:** `Shaking already?`
- **fidget:** `Pathetic.`
- **slip:** `I knew you couldn't.`
- **gaze:** `Who said you get to look?`
- **release:** `Get up. Slowly.`
- **prefix:** `Now —`
- **wrong:** `Wrong.`
- **late:** `Late. Again.`
- **look:** `Look at me.`
- **down:** `I didn't mean it.`
- **notLooking:** `Deaf as well?`

### regal
- **start:** `There. Stay.`
- **fidget:** `Be still. You're in my way like that.`
- **slip:** `Did that look like what I wanted?`
- **gaze:** `You don't look at me unless I let you.`
- **release:** `You may rise.`
- **clean:** `Acceptable.`
- **prefix:** `Attend —`
- **taken:** `Mm.`
- **wrong:** `No.`
- **late:** `I don't wait.`
- **look:** `Look at me.`
- **down:** `Enough looking.`
- **notLooking:** `I asked for your eyes.`
