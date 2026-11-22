// Importing this module registers every call type (P14): the envelope is the only caller of the model, and a site must find its call type
// whichever controller is loaded first. Each module registers its own call type and keeps its sanitizer; none of them calls the model.
import './activityVignette';
import './chronicleCompact';
import './commanderImport';
import './dilemmaGenerate';
import './directorTick';
import './dmReply';
import './emotionPick';
import './epilogue';
import './expeditionRecap';
import './flavor';
import './intentExtract';
import './memoryFold';
import './profileImport';
import './rumorRetell';
import './sceneSummary';
import './wardenAgenda';
import './wardenJudge';
import './headStartRecap'; // P11b
import './developmentReview'; // P14b
import './opinionForm'; // P14c
import './physicsCues'; // P15a
import './practiceGenerate'; // P16
