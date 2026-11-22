const weekly = (periods, closed = []) => Object.fromEntries(Array.from({length:7},(_,d)=>[d,closed.includes(d)?[]:periods]));
export const places = [
{id:'gyeongbok',name:'경복궁',category:'궁궐 · 역사',address:'서울 종로구 사직로 161',lat:37.5796,lng:126.977,zone:'Asia/Seoul',hours:weekly([[540,1080]],[2]),symbol:'宮',description:'도심에서 시작하는 고요한 궁궐 산책. 광화문을 지나 넓은 마당을 걸어보세요.'},
{id:'bukchon',name:'북촌 한옥마을',category:'동네 · 산책',address:'서울 종로구 계동길 37 일대',lat:37.5826,lng:126.9831,zone:'Asia/Seoul',hours:weekly([[600,1020]]),symbol:'屋',description:'골목마다 이어지는 한옥의 지붕선. 주민이 생활하는 공간에서는 조용히 걸어주세요.'},
{id:'insadong',name:'인사동',category:'문화 · 쇼핑',address:'서울 종로구 인사동길',lat:37.5743,lng:126.9857,zone:'Asia/Seoul',hours:weekly([[600,1200]]),symbol:'文',description:'공예와 작은 가게, 차 한 잔을 만나는 거리.'},
{id:'gwangjang',name:'광장시장',category:'시장 · 먹거리',address:'서울 종로구 창경궁로 88',lat:37.5701,lng:126.9997,zone:'Asia/Seoul',hours:weekly([[540,900],[1020,1380]]),symbol:'食',description:'시장 골목에서 잠시 쉬어가세요. 분할 영업시간을 시험할 수 있는 샘플입니다.'},
{id:'cheonggye',name:'청계천',category:'하천 · 산책',address:'서울 종로구 청계천로 일대',lat:37.5692,lng:126.9788,zone:'Asia/Seoul',hours:weekly([[0,1440]]),symbol:'川',description:'도심 사이로 이어지는 물길을 따라 천천히 걷는 시간.'},
{id:'namsan',name:'N서울타워',category:'전망 · 야경',address:'서울 용산구 남산공원길 105',lat:37.5512,lng:126.9882,zone:'Asia/Seoul',hours:weekly([[600,1380]]),symbol:'塔',description:'서울의 풍경을 내려다보며 하루를 마무리하세요.'},
{id:'ddp',name:'동대문디자인플라자',category:'건축 · 전시',address:'서울 중구 을지로 281',lat:37.5665,lng:127.0092,zone:'Asia/Seoul',hours:null,symbol:'曲',description:'운영시간 미확인 경고를 확인할 수 있는 샘플 장소입니다.'},
{id:'night',name:'을지로 밤 카페 (가상)',category:'데모 · 심야 영업',address:'서울 중구 을지로 일대 · 가상 장소',lat:37.5662,lng:126.991,zone:'Asia/Seoul',hours:weekly([[1080,1560]]),symbol:'月',description:'18:00–다음 날 02:00. 자정 이후 일정 계산을 검증하기 위한 가상 카페입니다.'}
].map(p=>({...p,source:'demo',hoursLabel:'시연용 주간 시간표 · 실제 영업정보 아님'}));
export function routeFixture(scenario){
 return {async route({signal}){
  await Promise.resolve();signal?.throwIfAborted();
  return scenario==='no-routes'?{status:'no-route'}:{status:'ok',minutes:10};
 }};
}
