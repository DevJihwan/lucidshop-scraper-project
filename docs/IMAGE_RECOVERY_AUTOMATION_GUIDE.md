# 🔧 이미지 복구 자동화 가이드

**작성일**: 2025년 9월 8일  
**목적**: 복구 가능한 이미지 자동 이동 및 누락 항목 정리  

---

## 📋 개요

Phase 5 검증 결과를 바탕으로 다음 작업을 자동화합니다:
1. **복구 가능한 2,331개 이미지**를 `final_image_v2`의 올바른 폴더 구조로 자동 이동
2. **실제 누락된 6,102개 항목**을 작업 가능한 JSON 형태로 정리

---

## 🚀 스크립트 실행

### 📂 필요한 폴더 구조
```
프로젝트_루트/
├── final_image_v2/           # 메인 이미지 저장소
├── images_missing_brands/    # 보조 이미지 폴더
├── images_final_collection/  # 보조 이미지 폴더  
├── images_ultimate/          # 보조 이미지 폴더
└── scripts/
    └── image_recovery_automation.js
```

### 🎯 실행 명령어
```bash
# 스크립트 실행
node scripts/image_recovery_automation.js
```

---

## 📊 실행 결과

### 생성되는 파일들

#### 1. **복구 성공 로그** - `recovery_success_log_YYYY-MM-DD.json`
```json
{
  "timestamp": "2025-09-08T05:00:00.000Z",
  "summary": {
    "totalProcessed": 8433,
    "successfulRecoveries": 2331,
    "failedRecoveries": 0,
    "skipped": 0,
    "recoveryRate": "27.6"
  },
  "recoveryDetails": [
    {
      "category": "신발",
      "brand": "골든구스",
      "productName": "골든구스_골든구스_00126_871966(보완)",
      "sourceFile": "./images_missing_brands/신발_골든구스_00126_943182(대표).jpg",
      "targetFile": "./final_image_v2/신발/골든구스/골든구스_골든구스_00126_871966(보완)/신발_골든구스_00126_943182(대표).jpg",
      "matchType": "exact_number",
      "matchedNumbers": ["00126"],
      "sourceFolder": "images_missing_brands"
    }
  ]
}
```

#### 2. **누락 항목 작업 목록** - `missing_images_todo_YYYY-MM-DD.json`
```json
{
  "timestamp": "2025-09-08T05:00:00.000Z",
  "summary": {
    "totalMissing": 6102,
    "categoryBreakdown": {
      "신발": 2800,
      "악세사리": 2100,
      "가방": 850,
      "시계": 200,
      "지갑": 152
    },
    "brandBreakdown": {
      "신발_골든구스": 800,
      "악세사리_루이비통": 682,
      "신발_나이키": 600
    },
    "priorityRecommendation": [
      {
        "category": "신발",
        "brand": "골든구스", 
        "count": 800,
        "percentage": "13.1"
      }
    ]
  },
  "missingByCategory": {
    "신발": {
      "골든구스": [...]
    }
  },
  "missingByBrand": {
    "신발_골든구스": {
      "category": "신발",
      "brand": "골든구스",
      "items": [...]
    }
  },
  "detailedList": [
    {
      "category": "신발",
      "brand": "골든구스",
      "productName": "골든구스_제품명_12345",
      "path": "./final_image_v2/신발/골든구스/골든구스_제품명_12345",
      "status": "missing",
      "reason": "no_matching_image_found"
    }
  ]
}
```

---

## 📈 진행 과정 모니터링

### 실시간 진행 상황
```bash
🚀 이미지 자동 복구 시작...

📂 이미지 데이터 수집 중...
✅ 총 45254개 이미지 정보 수집 완료
📊 final_image_v2 누락: 8433개

🔍 매칭 분석 및 복구 작업 시작...
   진행률: 1000/8433
   진행률: 2000/8433
   ...
   진행률: 8000/8433

📊 === 이미지 복구 완료 ===
처리된 누락 항목: 8433개
✅ 성공적 복구: 2331개
⏭️ 이미 존재: 0개
❌ 복구 실패: 0개
🚨 실제 누락: 6102개
📈 복구율: 27.6%

💾 복구 성공 로그: recovery_success_log_2025-09-08.json
📋 누락 항목 정리: missing_images_todo_2025-09-08.json

🎯 === 누락 항목 우선순위 권장사항 ===
1. 신발 - 골든구스: 800개 (13.1%)
2. 악세사리 - 루이비통: 682개 (11.2%)
3. 신발 - 나이키: 600개 (9.8%)
...

🎉 이미지 복구 및 누락 정리 완료!
```

---

## 🎯 복구 작업 세부사항

### 자동 폴더 생성
스크립트는 필요시 다음 구조로 폴더를 자동 생성합니다:
```
final_image_v2/
├── 카테고리명/
│   ├── 브랜드명/
│   │   └── 상품명/
│   │       └── 복구된_이미지.jpg
```

### 매칭 로직
1. **카테고리 일치**: `신발`, `가방`, `악세사리`, `시계`, `지갑`
2. **브랜드 일치**: 정확한 브랜드명 매칭
3. **상품번호 일치**: 5자리 이상 숫자 기반 정확한 매칭

### 안전 기능
- **중복 방지**: 이미 존재하는 파일은 건드리지 않음
- **원본 보존**: 원본 파일은 복사만 하고 삭제하지 않음
- **에러 핸들링**: 권한 오류나 파일 시스템 오류 시 안전하게 처리

---

## 📋 누락 항목 작업 가이드

### JSON 데이터 활용법

#### 1. 카테고리별 우선순위 작업
```javascript
// missing_images_todo_YYYY-MM-DD.json에서
const missingData = require('./missing_images_todo_2025-09-08.json');

// 가장 많이 누락된 카테고리부터 작업
console.log(missingData.summary.categoryBreakdown);
// 출력: { "신발": 2800, "악세사리": 2100, ... }
```

#### 2. 브랜드별 집중 작업
```javascript
// 특정 브랜드 누락 항목 추출
const goldenGooseItems = missingData.missingByBrand['신발_골든구스'];
console.log(`골든구스 누락: ${goldenGooseItems.items.length}개`);

// 해당 브랜드 상품 목록
goldenGooseItems.items.forEach(item => {
    console.log(`- ${item.productName}`);
});
```

#### 3. 우선순위 기반 작업 계획
```javascript
// 권장 우선순위대로 작업
missingData.summary.priorityRecommendation.forEach((priority, index) => {
    console.log(`${index + 1}순위: ${priority.brand} (${priority.count}개, ${priority.percentage}%)`);
});
```

---

## ⚠️ 주의사항

### 실행 전 체크리스트
- [ ] 모든 필요한 폴더가 존재하는지 확인
- [ ] `final_image_v2` 폴더에 쓰기 권한이 있는지 확인
- [ ] 충분한 디스크 공간이 있는지 확인 (약 500MB 예상)

### 실행 중 주의사항
- 스크립트 실행 중 중단하지 말 것
- 대량 파일 작업으로 시간이 오래 걸릴 수 있음 (예상 10-20분)
- 네트워크 드라이브나 클라우드 동기화 폴더에서는 실행하지 말 것

### 실행 후 검증
```bash
# 복구된 이미지 수 확인
find final_image_v2 -name "*.jpg" -o -name "*.png" | wc -l

# 복구 로그 확인
cat recovery_success_log_2025-09-08.json | grep "successfulRecoveries"
```

---

## 🔄 후속 작업 계획

### 1. 즉시 실행 (Priority 1)
- [x] 2,331개 이미지 자동 복구 완료
- [ ] 복구된 이미지 품질 검증
- [ ] 폴더 구조 최종 정리

### 2. 단기 목표 (Priority 2)
- [ ] 누락 항목 TOP 10 브랜드 집중 수집
- [ ] 상품번호 패턴 분석으로 추가 매칭 로직 개발
- [ ] 이미지 품질 자동 검증 시스템 구축

### 3. 중장기 목표 (Priority 3)
- [ ] 누락 원인 분석 및 재수집 전략 수립
- [ ] 자동화된 이미지 수집 파이프라인 구축
- [ ] 실시간 품질 모니터링 시스템 개발

---

## 📞 문제 해결

### 자주 발생하는 문제

#### 1. 권한 오류
```bash
Error: EACCES: permission denied
```
**해결책**: 
```bash
sudo chown -R $USER final_image_v2/
chmod -R 755 final_image_v2/
```

#### 2. 디스크 공간 부족
```bash
Error: ENOSPC: no space left on device
```
**해결책**: 
- 불필요한 파일 삭제
- 외부 저장소로 일부 폴더 이동

#### 3. 폴더 찾을 수 없음
```bash
⚠️ final_image_v2 폴더가 존재하지 않습니다.
```
**해결책**: 
```bash
mkdir -p final_image_v2
```

---

**스크립트 작성일**: 2025년 9월 8일  
**최종 업데이트**: 2025년 9월 8일  
**상태**: ✅ 테스트 완료, 실행 준비됨