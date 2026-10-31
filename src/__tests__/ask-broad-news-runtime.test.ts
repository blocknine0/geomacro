import {beforeEach,describe,expect,it,vi} from 'vitest';

const deps=vi.hoisted(()=>({hybrid:vi.fn(),search:vi.fn(),shared:vi.fn(),original:vi.fn()}));
vi.mock('../lib/hybrid-ask-intelligence.server',()=>({answerQuestion:deps.hybrid}));
vi.mock('../lib/ask-on-demand-original.server',()=>({answerFromCurrentOriginals:deps.original}));
vi.mock('../lib/ask-official-numeric.server',()=>({planAskOfficialNumeric:()=>null,answerOfficialNumeric:vi.fn()}));
vi.mock('../lib/ask-realtime-search.server',()=>({realtimeSearchAnswer:deps.search}));
vi.mock('../lib/ask-shared-derived-journal.server',()=>({collectSharedOfficialNews:deps.shared}));
import {answerAskQuestion} from '../lib/ask-answer.server';

describe('free broad news request avoids unavailable scored storage and model calls',()=>{
 beforeEach(()=>{vi.clearAllMocks();deps.original.mockResolvedValue(null);
  deps.shared.mockResolvedValue({signals:[],journal_categories_reused:[],live_categories_queried:[]});
  deps.search.mockResolvedValue(null)});
 it.each(['Latest geopolitics news','Latest macro news','Latest critical minerals news','What changed today?'])(
  'returns an honest insufficient answer for %s when bounded sources are empty',async question=>{
   const result=await answerAskQuestion(question);
   expect(deps.hybrid).not.toHaveBeenCalled();
   expect(deps.search).toHaveBeenCalledWith(question,expect.objectContaining({
    insufficient_evidence:true,signed_gro_generated:false,gri:null,
   }),{deterministicOnly:true});
   expect(result).toMatchObject({insufficient_evidence:true,signed_gro_generated:false,
    independent_same_event_verification:false,durable_live_storage_write:false,gri:null});
   expect(result.why_it_matters).toContain('does not mean no developments occurred globally');
  });
 it('uses a verified original release ahead of generic storage and discovery',async()=>{
  const observed={summary:'An originating release was observed',insufficient_evidence:false};
  deps.original.mockResolvedValueOnce(observed);
  expect(await answerAskQuestion('Latest lithium news in China')).toBe(observed);
  expect(deps.hybrid).not.toHaveBeenCalled();
  expect(deps.search).not.toHaveBeenCalled();
 });
 it('retains the original insufficient answer when index transport fails',async()=>{
  deps.search.mockRejectedValueOnce(new Error('UPSTREAM_TIMEOUT'));
  const result=await answerAskQuestion('Latest macro news');
  expect(result.insufficient_evidence).toBe(true);expect(deps.hybrid).not.toHaveBeenCalled();
 });
 it('returns actual native-dated official observations before index lookup',async()=>{
  deps.shared.mockResolvedValueOnce({
   journal_categories_reused:['macro'],live_categories_queried:[],signals:[{
   id:'test-observation',category:'macro',published_at:new Date(Date.now()-3600_000).toISOString(),
   status:'official_release_observed_unscored',same_event_corrob_verified:false,severity:null,
   title:'An official observation',what_changed:'A bounded observation.',why_it_matters:'Unscored context.',
  }]});
  const result=await answerAskQuestion('Latest macro news');
  expect(result).toMatchObject({intelligence_tier:'official_observation_unscored',signed_gro_generated:false});
  expect(deps.search).not.toHaveBeenCalled();expect(deps.hybrid).not.toHaveBeenCalled();
  expect(deps.original).not.toHaveBeenCalled();
  expect(deps.shared).toHaveBeenCalledWith(['macro']);
 });
 it.each([
  ['Can you summarize recent geopolitical developments?', ['geopolitics']],
  ['Please give me the latest macroeconomic news', ['macro']],
  ['Show recent critical minerals updates', ['rare_earth']],
  ['Latest geopolitics and macro news', ['geopolitics','macro']],
 ])('routes broad natural-language news through the matching journal: %s', async (question, categories) => {
   const response={summary:'An issuer observation',insufficient_evidence:false};
   deps.shared.mockResolvedValueOnce({signals:[{
     id:'broad-news-proof',category:categories[0],title:'Original publication',
     what_changed:'An official update was observed.',why_it_matters:'Context only.',
     published_at:new Date().toISOString(),
   }],journal_categories_reused:categories,live_categories_queried:[]});
   const result=await answerAskQuestion(question);
   expect(result.insufficient_evidence).toBe(false);
   expect(deps.shared).toHaveBeenCalledWith(categories);
   expect(deps.hybrid).not.toHaveBeenCalled();
 });
 it.each(['Latest macro news in India','Latest lithium news','Current copper mining plans in Chile','What is the latest sanctions status in Iran?'])(
  'avoids substituting unrelated broad journal releases for a scoped question: %s', async question => {
   deps.hybrid.mockResolvedValueOnce({summary:'Governed path',insufficient_evidence:false});
   const answer=await answerAskQuestion(question);
   expect(answer.summary).toBe('Governed path');
   expect(deps.shared).not.toHaveBeenCalled();
 });
 it.each(['Latest macro news in India','What is the current GRI?','Explain lithium risk for China'])(
  'keeps country and scored questions on the governed path: %s',async question=>{
   const prior={summary:'Governed assessment',insufficient_evidence:false};
   deps.hybrid.mockResolvedValueOnce(prior);
   expect(await answerAskQuestion(question)).toBe(prior);
   expect(deps.hybrid).toHaveBeenCalledWith(question);expect(deps.search).not.toHaveBeenCalled();
  });
});
