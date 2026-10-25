'use strict';
// Only the labels of forms missing from Pokémon Showdown's Korean text are
// generated here. Never change the species ID, abilities, or battle rules.
// A literal form map is intentional: it keeps distinctly playable forms
// from collapsing into an indistinguishable base-species label.
const baseOverrides={
 floette:'플라엣테',zygarde:'지가르데',toxtricity:'스트린더',
 alcremie:'마휘핑',urshifu:'우라오스',dudunsparce:'노고고치'
};
const types={Bug:'벌레',Dark:'악',Dragon:'드래곤',Electric:'전기',
 Fairy:'페어리',Fighting:'격투',Fire:'불꽃',Flying:'비행',Ghost:'고스트',
 Grass:'풀',Ground:'땅',Ice:'얼음',Poison:'독',Psychic:'에스퍼',
 Rock:'바위',Steel:'강철',Water:'물'};
const forms={
 'Male':'수컷의 모습','Female':'암컷의 모습',
 'Family of Three':'3마리 가족','Family of Four':'4마리 가족',
 'Gigantamax':'거다이맥스의 모습',
 'Alolan Form':'알로라의 모습','Galarian Form':'가라르의 모습',
 'Hisuian Form':'히스이의 모습','Paldean Form':'팔데아의 모습',
 'Primal Reversion':'원시회귀',
 'Spiky-eared':'삐죽귀의 모습',
 'Cosplay Pikachu':'코스프레',
 'Pikachu Rock Star':'록스타','Pikachu Belle':'마담',
 'Pikachu Pop Star':'아이돌','Pikachu, Ph.D.':'박사',
 'Pikachu Libre':'마스크드',
 'Original Cap':'오리지널캡','Hoenn Cap':'호연캡',
 'Sinnoh Cap':'신오캡','Unova Cap':'하나캡',
 'Kalos Cap':'칼로스캡','Alola Cap':'알로라캡',
 'Partner Cap':'너로정했다캡','World Cap':'월드캡',
 'Partner Pikachu':'파트너','Partner Eevee':'파트너',
 'Sunny Form':'태양의 모습','Rainy Form':'빗방울의 모습',
 'Snowy Form':'설운의 모습',
 'Attack Forme':'어택폼','Defense Forme':'디펜스폼',
 'Speed Forme':'스피드폼','Plant Cloak':'초목도롱',
 'Sandy Cloak':'모래땅도롱','Trash Cloak':'슈레도롱',
 'Sunshine Form':'포지폼',
 'West Sea':'서쪽바다','East Sea':'동쪽바다',
 'Origin Forme':'오리진폼','Altered Forme':'어나더폼',
 'Land Forme':'랜드폼','Sky Forme':'스카이폼',
 'Red-Striped Form':'적색근의 모습','Blue-Striped Form':'청색근의 모습',
 'White-Striped Form':'백색근의 모습',
 'Zen Mode':'달마모드',
 'Spring Form':'봄의 모습','Summer Form':'여름의 모습',
 'Autumn Form':'가을의 모습','Winter Form':'겨울의 모습',
 'Incarnate Forme':'화신폼','Therian Forme':'영물폼',
 'Resolute Form':'각오의 모습',
 'Pirouette Forme':'스텝폼',
 'Douse Drive':'아쿠아카세트','Shock Drive':'번개카세트',
 'Burn Drive':'블레이즈카세트','Chill Drive':'프리즈카세트',
 'Battle Bond':'유대변화',
 'Meadow Pattern':'화원무늬','Icy Snow Pattern':'설국무늬',
 'Polar Pattern':'설원무늬','Tundra Pattern':'툰드라무늬',
 'Continental Pattern':'대륙무늬','Garden Pattern':'정원무늬',
 'Elegant Pattern':'우아무늬','Modern Pattern':'모던무늬',
 'Marine Pattern':'마린무늬','Archipelago Pattern':'군도무늬',
 'High Plains Pattern':'황야무늬','Sandstorm Pattern':'사막무늬',
 'River Pattern':'대하무늬','Monsoon Pattern':'스콜무늬',
 'Savanna Pattern':'사바나무늬','Sun Pattern':'태양무늬',
 'Ocean Pattern':'대양무늬','Jungle Pattern':'정글무늬',
 'Fancy Pattern':'팬시무늬','Poké Ball Pattern':'볼무늬',
 'Red Flower':'빨간 꽃','Blue Flower':'파란 꽃',
 'Yellow Flower':'노란 꽃','Orange Flower':'주황 꽃',
 'White Flower':'하얀 꽃','Eternal Flower':'영원의 꽃',
 'Blade Forme':'블레이드폼',
 'Small Variety':'작은 사이즈','Large Variety':'큰 사이즈',
 'Jumbo Variety':'특대 사이즈',
 'Neutral Mode':'릴랙스모드',
 '50% Forme':'50%폼','10% Forme':'10%폼',
 'Complete Forme':'퍼펙트폼',
 'Hoopa Confined':'굴레에 빠진 모습','Hoopa Unbound':'굴레를 벗어난 모습',
 'Totem':'주인의 모습','Baile Style':'이글이글스타일',
 'Pom-Pom Style':'파칙파칙스타일','Pa’u Style':'훌라훌라스타일',
 'Sensu Style':'하늘하늘스타일',
 'Own Tempo':'마이페이스',
 'Midday Form':'한낮의 모습','Midnight Form':'한밤중의 모습',
 'Dusk Form':'황혼의 모습',
 'School Form':'군집의 모습',
 'Type: Bug':'벌레타입','Type: Dark':'악타입',
 'Type: Dragon':'드래곤타입','Type: Electric':'전기타입',
 'Type: Fairy':'페어리타입','Type: Fighting':'격투타입',
 'Type: Fire':'불꽃타입','Type: Flying':'비행타입',
 'Type: Ghost':'고스트타입','Type: Grass':'풀타입',
 'Type: Ground':'땅타입','Type: Ice':'얼음타입',
 'Type: Poison':'독타입','Type: Psychic':'에스퍼타입',
 'Type: Rock':'바위타입','Type: Steel':'강철타입',
 'Type: Water':'물타입',
 'Red Core':'빨강 코어','Orange Core':'주황 코어',
 'Yellow Core':'노랑 코어','Green Core':'초록 코어',
 'Blue Core':'파랑 코어','Indigo Core':'남색 코어',
 'Violet Core':'보라 코어','Meteor Form':'유성의 모습',
 'Busted Form':'들킨 모습','Dusk Mane':'황혼의 갈기',
 'Dawn Wings':'새벽의 날개','Original Color':'500년 전의 색',
 'Gulping Form':'그대로 삼킨 모습','Gorging Form':'통째로 삼킨 모습',
 'Amped Form':'하이한 모습','Low Key Form':'로우한 모습',
 'Vanilla Cream':'바닐라밀키','Ruby Cream':'루비밀키',
 'Matcha Cream':'말차밀키','Mint Cream':'민트밀키',
 'Lemon Cream':'레몬밀키','Ruby Swirl':'루비믹스',
 'Caramel Swirl':'캐러멜믹스','Rainbow Swirl':'레인보우믹스',
 'Antique Form':'진품',
 'Noice Face':'나이스페이스','Hangry Mode':'배고픈 모양',
 'Crowned Sword':'검왕의 모습','Crowned Shield':'방패왕의 모습',
 'Eternamax':'무한다이맥스',
 'Single Strike Style':'일격의 태세',
 'Rapid Strike Style':'연격의 태세',
 'Dada':'아빠의 모습',
 'Ice Rider':'백마 탄 모습','Shadow Rider':'흑마 탄 모습',
 'Bloodmoon':'붉은 달',
 'Green Plumage':'그린 페더','Blue Plumage':'블루 페더',
 'Yellow Plumage':'옐로 페더','White Plumage':'화이트 페더',
 'Hero Form':'마이티폼',
 'Curly Form':'젖힌 모습','Droopy Form':'늘어진 모습',
 'Stretchy Form':'뻗은 모습',
 'Two-Segment Form':'두마디폼','Three-Segment Form':'세마디폼',
 'Roaming Form':'도보폼',
 'Artisan Form':'걸작품','Masterpiece Form':'진작품',
 'Teal Mask':'벽록의 가면','Wellspring Mask':'우물의 가면',
 'Hearthflame Mask':'화덕의 가면','Cornerstone Mask':'주춧돌의 가면',
 'Terastal Form':'테라스탈폼','Stellar Form':'스텔라폼',
 'Original Cap':'오리지널캡'
};
const itemOverrides={mail:'편지',crucibellite:'크루시벨나이트',vilevial:'바이얼'};
const abilityOverrides={noability:'특성 없음',auraguard:'오라가드',
 mountaineer:'산악인',rebound:'되튕기기',persistent:'지속력'};
const moveOverrides={nihillight:'니힐라이트',paleowave:'페일리오웨이브',
 shadowstrike:'섀도스트라이크',polarflare:'폴라플레어'};
function englishForm(obj,data){
 if(data?.forme)return data.forme;
 if(obj.forme)return obj.forme;
 return '';
}
function extraLabel(obj,data){
 const raw=englishForm(obj,data);
 if(/[가-힣]/.test(raw))return raw;
 if(forms[raw])return forms[raw];
 if(obj.baseSpecies==='Arceus'||obj.baseSpecies==='Silvally'){
  const type=raw.replace(/^Type:\s*/, '');
  if(types[type])return types[type]+'타입';
 }
 // Generic fallback is intentionally explicit rather than erasing identity.
 // CI rejects these for official Pokémon, so new forms need proper labels.
 return '';
}
function fallbackFormName(obj,data,base){
 if(!base||!/[가-힣]/.test(base))return null;
 const type=obj.forme||'';
 if(obj.isMega)return null; // The specialized Mega naming logic handles these.
 if(type==='Primal')return '원시'+base;
 const label=extraLabel(obj,data);
 if(label)return base+'（'+label+'）';
 if(!type)return base;
 return null;
}
module.exports={baseOverrides,forms,types,itemOverrides,abilityOverrides,moveOverrides,
 fallbackFormName,extraLabel};
