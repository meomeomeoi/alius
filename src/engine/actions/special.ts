import { registerAction } from '../dispatch';
import { frequencyText } from '../special/frequency/fragments';

// Importing this module registers the P12 special-trait actions and day step. It must come after `actions/loyalty` (the paranoia
// step reads what P6's loyalty step just decided) and after `actions/personal` (the frequency route finds the squad secrets).

const FRAGMENT_MAX = 160;

/**
 * Stores the worded fragment of an intercept that has none yet (the controller asks the model, or takes the template). The text is
 * trimmed and its blanks collapsed; an empty or overlong one is refused, so a bad answer never reaches the state.
 */
registerAction('frequency/word', (draft, payload) => {
  const p = (typeof payload === 'object' && payload !== null ? payload : {}) as { id?: unknown; text?: unknown };
  const x = draft.special?.frequency?.intercepts.find((y) => y.id === p.id);
  if (!x) throw new Error('frequency/word: unknown intercept.');
  if (x.text !== undefined) throw new Error('frequency/word: this fragment is already worded.');
  const text = frequencyText(p.text);
  if (text === null) throw new Error(`frequency/word: a fragment is 1 to ${FRAGMENT_MAX} characters.`);
  x.text = text;
  return [{ type: 'frequency_worded', interceptId: x.id }];
});
