나는 STRIKE 기록 웹페이지를 만들고 있다.
이 웹은 오늘 하루만 사용할 예정이라 보안, 인증, 권한, 관리자 기능은 전혀 중요하지 않다.
중요한 것은 “작동만 제대로” 하는 것이다.

배포는 Vercel로 할 것이다.

매우 중요:
- 오직 현재 strike.db의 실제 테이블/컬럼만 기준으로 구현해라.
- DB 마이그레이션, 스키마 변경, seed 생성, ORM 모델 재설계 같은 거 하지 마라.
- 모든 데이터는 strike.db에서 직접 가져와라.
- AVG, OPS, ERA 같은 계산 스탯은 DB에 저장하지 말고 웹에서 직접 계산해라.
- 모바일 우선 UI로 만들어라.
- README 요구사항을 우선 반영해라.
- 지금 필요한 건 “예쁜 설계”보다 “바로 돌아가는 웹”이다.

기술 방향:
- Vercel 배포가 쉬운 구조로 만들어라.
- 서버에서 sqlite 네이티브 모듈을 억지로 붙이지 말고, 가능하면 strike.db 파일을 그대로 읽어서 사용하는 단순한 구조로 가라.
- today-only demo 성격이라 복잡한 백엔드 계층 만들지 마라.
- 사용자가 보기 좋은 모바일 웹이면 된다.

================================
[README 요구사항 요약]
================================

컨셉:
- 야구 동아리의 기록 확인 웹페이지
- 공식 기록 앱 + 동아리 히스토리 아카이브 느낌
- 모바일 우선

필수 메뉴:
1. 홈 화면
   - logo.glb가 배경 없이 가장 위에 위치, 클릭 시 회전
   - 최근 경기 일정/결과
   - player ranking(타자): 타율, 홈런, 타점 3위까지
   - player ranking(투수): 평균자책점, 승리, 탈삼진
   - instagram 영역(@knu_strike)

2. 팀 기록 메뉴
   - 우리 팀 기준 승/패 확인 가능
   - 리그(또는 tournament), 상대 학교, 점수
   - R / H / E / B 표시

3. 선수 기록 메뉴
   - 선수 검색 기능
   - 모든 선수에 대해 타자 기록 + 투수 기록 둘 다 표시
   - 타자 기록: 경기 수, AVG, 홈런, 득점, 안타, OPS
   - 투수 기록: 경기 수, ERA, 승, 패, 이닝, 탈삼진
   - 타임라인: 어떤 경기에 출전했는지

4. RANKING 메뉴
   - 타자 / 투수 선택 기능
   - 타자 랭킹: 경기 수, AVG, 홈런, 득점, 안타, OPS
   - 투수 랭킹: 경기 수, ERA, 승, 패, 이닝, 탈삼진
   - 1위 강조 카드 구조

주의:
- AVG, OPS, ERA는 웹에서 직접 계산
- 모든 데이터는 strike.db 사용
- 모바일 기준 구현

================================
[실제 strike.db 스키마]
================================

아래가 “현재 strike.db 실제 스키마”다.
반드시 이것만 기준으로 구현해라.

1) players
- id INTEGER PRIMARY KEY
- name TEXT NOT NULL
- student_id TEXT
- display_name TEXT NOT NULL
- number INTEGER
- position TEXT

의미:
- 선수 기본 정보 테이블
- 화면 표시는 display_name 우선
- 검색은 display_name, name 둘 다 가능하게

2) games
- id INTEGER PRIMARY KEY
- sheet_name TEXT NOT NULL
- game_date TEXT
- tournament TEXT
- opponent TEXT
- game_time TEXT
- stadium TEXT
- strike_score INTEGER
- opponent_score INTEGER

의미:
- 경기 기본 정보
- strike_score가 우리 팀 점수
- opponent_score가 상대 점수
- 승패 계산:
  - strike_score > opponent_score => 승
  - strike_score < opponent_score => 패
  - 같으면 무

주의:
- games 테이블에는 our_hits, our_errors, our_walks 컬럼이 없다.
- 따라서 팀 기록 메뉴의 H/E/B는 game_batting을 집계해서 직접 계산해야 한다.

3) batter_career
- id INTEGER PRIMARY KEY
- player_id INTEGER NOT NULL
- games INTEGER
- putouts INTEGER
- assists INTEGER
- errors INTEGER
- double_plays INTEGER
- pa INTEGER
- ab INTEGER
- runs INTEGER
- hits INTEGER
- doubles INTEGER
- triples INTEGER
- home_runs INTEGER
- total_bases INTEGER
- rbi INTEGER
- steals INTEGER
- sac_bunts INTEGER
- sac_flies INTEGER
- walks INTEGER
- hit_by_pitch INTEGER
- strikeouts INTEGER
- lob INTEGER

의미:
- 선수 통산 타자 기록
- 선수 상세 타자 기록과 타자 랭킹의 주요 기반 테이블

4) pitcher_career
- id INTEGER PRIMARY KEY
- player_id INTEGER NOT NULL
- games INTEGER
- putouts INTEGER
- assists INTEGER
- errors INTEGER
- double_plays INTEGER
- starts INTEGER
- complete_games INTEGER
- wins INTEGER
- losses INTEGER
- holds INTEGER
- saves INTEGER
- innings_pitched REAL
- batters_faced INTEGER
- pitches INTEGER
- at_bats INTEGER
- hits_allowed INTEGER
- home_runs_allowed INTEGER
- sac_bunts_allowed INTEGER
- sac_flies_allowed INTEGER
- walks INTEGER
- hit_by_pitch INTEGER
- strikeouts INTEGER
- wild_pitches INTEGER
- balks INTEGER
- runs_allowed INTEGER
- earned_runs INTEGER

의미:
- 선수 통산 투수 기록
- 선수 상세 투수 기록과 투수 랭킹의 주요 기반 테이블

5) game_batting
- id INTEGER PRIMARY KEY
- game_id INTEGER NOT NULL
- player_id INTEGER NOT NULL
- batting_order_text TEXT
- games INTEGER
- putouts INTEGER
- assists INTEGER
- errors INTEGER
- double_plays INTEGER
- pa INTEGER
- ab INTEGER
- runs INTEGER
- hits INTEGER
- doubles INTEGER
- triples INTEGER
- home_runs INTEGER
- total_bases INTEGER
- rbi INTEGER
- steals INTEGER
- sac_bunts INTEGER
- sac_flies INTEGER
- walks INTEGER
- hit_by_pitch INTEGER
- strikeouts INTEGER
- lob INTEGER

의미:
- 경기별 타자 기록
- 선수 타임라인, 경기 상세, 팀 H/E/B 집계에 사용 가능
- 팀 H = SUM(hits)
- 팀 E = SUM(errors)
- 팀 B = SUM(walks)
- game_id 기준 집계

6) game_pitching
- id INTEGER PRIMARY KEY
- game_id INTEGER NOT NULL
- player_id INTEGER NOT NULL
- pitching_order_text TEXT
- games INTEGER
- putouts INTEGER
- assists INTEGER
- errors INTEGER
- double_plays INTEGER
- starts INTEGER
- complete_games INTEGER
- wins INTEGER
- losses INTEGER
- holds INTEGER
- saves INTEGER
- innings_pitched REAL
- batters_faced INTEGER
- pitches INTEGER
- at_bats INTEGER
- hits_allowed INTEGER
- home_runs_allowed INTEGER
- sac_bunts_allowed INTEGER
- sac_flies_allowed INTEGER
- walks INTEGER
- hit_by_pitch INTEGER
- strikeouts INTEGER
- wild_pitches INTEGER
- balks INTEGER
- runs_allowed INTEGER
- earned_runs INTEGER

의미:
- 경기별 투수 기록
- 선수 타임라인, 경기 상세 투수 기록에 사용 가능

7) batting_stats
- id INTEGER PRIMARY KEY
- player_id INTEGER NOT NULL
- game_id INTEGER NOT NULL
- at_bats INTEGER DEFAULT 0
- hits INTEGER DEFAULT 0
- doubles INTEGER DEFAULT 0
- triples INTEGER DEFAULT 0
- home_runs INTEGER DEFAULT 0
- rbi INTEGER DEFAULT 0
- runs INTEGER DEFAULT 0
- walks INTEGER DEFAULT 0
- strikeouts INTEGER DEFAULT 0

주의:
- 이 테이블은 간략 버전 경기 타자 통계다.
- 하지만 더 상세한 데이터가 game_batting에 있으므로,
  기본적으로 화면 구현은 game_batting을 우선 사용해라.

8) pitching_stats
- id INTEGER PRIMARY KEY
- player_id INTEGER NOT NULL
- game_id INTEGER NOT NULL
- outs_pitched INTEGER DEFAULT 0
- earned_runs INTEGER DEFAULT 0
- win INTEGER DEFAULT 0
- loss INTEGER DEFAULT 0
- strikeouts INTEGER DEFAULT 0
- hits_allowed INTEGER DEFAULT 0
- walks_allowed INTEGER DEFAULT 0

주의:
- 이 테이블도 간략 버전 경기 투수 통계다.
- 더 상세한 데이터가 game_pitching에 있으므로,
  기본적으로 화면 구현은 game_pitching을 우선 사용해라.

================================
[테이블 사용 원칙]
================================

반드시 아래 우선순위를 따라라.

1. 선수 기본 목록/검색
- players 사용

2. 선수 상세 타자 기록
- batter_career 사용

3. 선수 상세 투수 기록
- pitcher_career 사용

4. 선수 타임라인(어떤 경기에 출전했는지)
- game_batting + game_pitching + games 조합
- 한 선수가 game_batting 또는 game_pitching 중 하나라도 있으면 그 경기 출전으로 간주

5. 홈 화면 최근 경기
- games 사용
- game_date DESC 기준 최신순

6. 팀 기록 메뉴
- games + game_batting 집계 사용
- H = SUM(game_batting.hits)
- E = SUM(game_batting.errors)
- B = SUM(game_batting.walks)

7. 랭킹
- 타자 랭킹: batter_career 기반
- 투수 랭킹: pitcher_career 기반

8. batting_stats, pitching_stats
- 기본 구현에서는 우선 사용하지 않아도 된다.
- game_batting, game_pitching 데이터가 더 풍부하므로 그쪽을 우선해라.

================================
[계산 규칙]
================================

반드시 프론트 또는 앱 코드에서 계산해라.

1. AVG
- AVG = hits / ab
- ab가 0이면 0
- 표시 형식 예: 0.333

2. OBP
- OBP = (hits + walks + hit_by_pitch) / (ab + walks + hit_by_pitch + sac_flies)
- 분모 0이면 0

3. SLG
- SLG = total_bases / ab
- ab가 0이면 0

4. OPS
- OPS = OBP + SLG
- 표시 형식 예: 0.987

5. ERA
- pitcher_career에서는:
  ERA = (earned_runs * 9) / innings_pitched
- innings_pitched가 0이면 0
- 표시 형식 예: 2.31

주의:
- 이 DB의 innings_pitched는 REAL 타입이므로 그대로 사용
- pitching_stats의 outs_pitched를 쓸 경우에는 innings = outs_pitched / 3 이지만,
  기본 구현은 pitcher_career, game_pitching 중심으로 가라.

================================
[화면별 요구사항]
================================

A. 홈 화면
반드시 포함:
- logo.glb
- 최근 경기 3~5개
- 타자 랭킹 top 3
  - AVG
  - 홈런
  - 타점
- 투수 랭킹 top 3
  - ERA
  - 승
  - 탈삼진
- instagram 섹션 (@knu_strike)

최근 경기 항목 표시:
- 날짜
- tournament
- opponent
- strike_score : opponent_score
- 승/패/무

B. 팀 기록 메뉴
반드시 표시:
- 날짜
- tournament
- opponent
- 점수
- 승/패/무
- R/H/E/B

계산:
- R = strike_score
- H = SUM(game_batting.hits)
- E = SUM(game_batting.errors)
- B = SUM(game_batting.walks)

C. 선수 기록 메뉴
반드시 포함:
- 선수 검색
- 선수 목록 또는 자동완성
- 선수 상세 페이지 또는 상세 패널
- 타자 기록
  - 경기 수
  - AVG
  - 홈런
  - 득점
  - 안타
  - OPS
- 투수 기록
  - 경기 수
  - ERA
  - 승
  - 패
  - 이닝
  - 탈삼진
- 타임라인
  - 어떤 경기(tournament / opponent / 날짜)에 출전했는지

타임라인 규칙:
- game_batting에 있거나 game_pitching에 있으면 출전
- 중복 경기 제거
- 날짜 내림차순 정렬

D. 랭킹 메뉴
상단 탭:
- 타자
- 투수

타자 랭킹 항목:
- 경기 수
- AVG
- 홈런
- 득점
- 안타
- OPS

투수 랭킹 항목:
- 경기 수
- ERA
- 승
- 패
- 이닝
- 탈삼진

UI:
- 1위는 강조 카드
- 나머지는 리스트

================================
[필요 SQL 예시]
================================

아래는 참고용이다. 실제 코드에 맞게 정리해도 되지만 의미는 유지해라.

1. 선수 목록
SELECT id, name, display_name, number, position
FROM players
ORDER BY display_name ASC;

2. 최근 경기
SELECT id, game_date, tournament, opponent, game_time, stadium, strike_score, opponent_score
FROM games
ORDER BY game_date DESC
LIMIT 5;

3. 팀 기록용 경기 + H/E/B 집계
SELECT
  g.id,
  g.game_date,
  g.tournament,
  g.opponent,
  g.strike_score,
  g.opponent_score,
  COALESCE(SUM(gb.hits), 0) AS team_hits,
  COALESCE(SUM(gb.errors), 0) AS team_errors,
  COALESCE(SUM(gb.walks), 0) AS team_walks
FROM games g
LEFT JOIN game_batting gb ON gb.game_id = g.id
GROUP BY g.id
ORDER BY g.game_date DESC;

4. 특정 선수 타자 통산
SELECT
  p.id,
  p.display_name,
  p.name,
  p.number,
  p.position,
  bc.games,
  bc.ab,
  bc.hits,
  bc.home_runs,
  bc.runs,
  bc.rbi,
  bc.walks,
  bc.hit_by_pitch,
  bc.sac_flies,
  bc.total_bases
FROM players p
LEFT JOIN batter_career bc ON bc.player_id = p.id
WHERE p.id = ?;

5. 특정 선수 투수 통산
SELECT
  p.id,
  p.display_name,
  p.name,
  p.number,
  p.position,
  pc.games,
  pc.wins,
  pc.losses,
  pc.innings_pitched,
  pc.strikeouts,
  pc.earned_runs
FROM players p
LEFT JOIN pitcher_career pc ON pc.player_id = p.id
WHERE p.id = ?;

6. 특정 선수 타임라인
SELECT DISTINCT
  g.id,
  g.game_date,
  g.tournament,
  g.opponent,
  g.strike_score,
  g.opponent_score
FROM games g
LEFT JOIN game_batting gb
  ON gb.game_id = g.id AND gb.player_id = ?
LEFT JOIN game_pitching gp
  ON gp.game_id = g.id AND gp.player_id = ?
WHERE gb.player_id IS NOT NULL OR gp.player_id IS NOT NULL
ORDER BY g.game_date DESC;

7. 타자 랭킹용 기본 데이터
SELECT
  p.id,
  p.display_name,
  p.number,
  p.position,
  bc.games,
  bc.ab,
  bc.hits,
  bc.home_runs,
  bc.runs,
  bc.rbi,
  bc.walks,
  bc.hit_by_pitch,
  bc.sac_flies,
  bc.total_bases
FROM batter_career bc
JOIN players p ON p.id = bc.player_id;

8. 투수 랭킹용 기본 데이터
SELECT
  p.id,
  p.display_name,
  p.number,
  p.position,
  pc.games,
  pc.wins,
  pc.losses,
  pc.innings_pitched,
  pc.strikeouts,
  pc.earned_runs
FROM pitcher_career pc
JOIN players p ON p.id = pc.player_id;

================================
[구현 지침]
================================

- build_strike_db.py를 참고해서 추론하지 마라.
- strike.db 실제 스키마만 보아라.
- 없는 컬럼을 지어내지 마라.
  예:
  - games.our_hits 없음
  - games.our_errors 없음
  - games.our_walks 없음
- 그러므로 H/E/B는 game_batting 집계로 계산해라.
- 간단하고 확실하게 구현해라.
- 오늘 하루용이므로 auth, admin, CMS, dashboard, upload, edit 기능 전부 필요 없다.
- read-only 웹이다.
- 에러가 나지 않는 방향으로 보수적으로 구현해라.
- null 안전 처리 철저히 해라.
- 값이 없으면 0 또는 "-" 처리.
- 모바일 화면에서 카드/탭/리스트 위주로 구현해라.
- 표가 너무 넓어지면 카드형으로 바꿔라.

================================
[원하는 결과물]
================================

이제 너는 아래를 한 번에 제안해라.

1. 프로젝트 폴더 구조
2. 필요한 패키지
3. strike.db를 어떻게 읽을지에 대한 구현 방식
4. DB 접근 유틸 코드
5. 스탯 계산 유틸 코드
6. 홈 화면 코드
7. 팀 기록 메뉴 코드
8. 선수 검색 + 선수 상세 코드
9. 랭킹 메뉴 코드
10. Vercel에서 바로 배포 가능한 형태의 최소 구현

중요:
- 설명만 하지 말고 실제 코드 위주로 작성해라.
- 내가 그대로 복붙해서 빠르게 만들 수 있게 해라.
- 불필요한 추상화, 과한 아키텍처, 테스트 코드, 인증 코드는 빼라.
- “지금 바로 동작 가능한” 결과를 우선해라.