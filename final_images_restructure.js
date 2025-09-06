const fs = require('fs');
const path = require('path');

// 한글 폴더명을 안전한 형태로 변환하는 함수
function sanitizeFolderName(name) {
    // 특수문자 제거 및 공백을 언더스코어로 변경
    return name.replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, '_').trim();
}

// savedImageName에서 고유 폴더명을 생성하는 함수
function generateFolderName(savedImageName) {
    // "가방_고야드 19FW 트렁크 스트랩백 그레이_18791(대표).jpg" 형태에서
    // 카테고리를 제외하고 나머지 부분을 폴더명으로 사용
    const nameWithoutExtension = savedImageName.replace(/\.(jpg|jpeg|png|gif|bmp|webp)$/i, '');
    const parts = nameWithoutExtension.split('_');
    
    if (parts.length >= 3) {
        // 카테고리(첫 번째 부분) 제외하고 나머지를 합침
        const folderName = parts.slice(1).join('_');
        return sanitizeFolderName(folderName);
    }
    
    // 파싱 실패시 원본 파일명 사용
    return sanitizeFolderName(nameWithoutExtension);
}

// 기존 final_images에서 이미지 파일을 찾는 함수
function findImageInOriginalFolder(savedImageName, originalImagesPath) {
    const categories = ['가방', '시계', '신발', '지갑', '악세사리'];
    
    for (const category of categories) {
        const categoryPath = path.join(originalImagesPath, category);
        if (!fs.existsSync(categoryPath)) continue;
        
        try {
            const subFolders = fs.readdirSync(categoryPath, { withFileTypes: true })
                .filter(dirent => dirent.isDirectory())
                .map(dirent => dirent.name);
            
            for (const subFolder of subFolders) {
                const subFolderPath = path.join(categoryPath, subFolder);
                try {
                    const files = fs.readdirSync(subFolderPath);
                    
                    for (const file of files) {
                        if (file === savedImageName) {
                            return path.join(subFolderPath, file);
                        }
                    }
                } catch (error) {
                    console.warn(`하위 폴더 읽기 실패: ${subFolderPath}`, error.message);
                }
            }
        } catch (error) {
            console.warn(`카테고리 폴더 읽기 실패: ${categoryPath}`, error.message);
        }
    }
    
    return null;
}

// 메인 재구성 함수
async function restructureFinalImages() {
    const dataFilePath = './final_data/backup_가방_2025-09-03.json';
    const originalImagesPath = './final_images';
    const newImagesPath = './final_image_v2';
    
    console.log('🔄 이미지 폴더 재구성 시작...\n');
    
    // 데이터 파일 확인
    if (!fs.existsSync(dataFilePath)) {
        console.error(`❌ 데이터 파일을 찾을 수 없습니다: ${dataFilePath}`);
        return;
    }
    
    // 원본 이미지 폴더 확인
    if (!fs.existsSync(originalImagesPath)) {
        console.error(`❌ 원본 이미지 폴더를 찾을 수 없습니다: ${originalImagesPath}`);
        return;
    }
    
    // 새 폴더 생성
    if (fs.existsSync(newImagesPath)) {
        console.log(`⚠️  기존 ${newImagesPath} 폴더가 존재합니다. 삭제 후 재생성합니다.`);
        fs.rmSync(newImagesPath, { recursive: true, force: true });
    }
    fs.mkdirSync(newImagesPath, { recursive: true });
    
    try {
        // JSON 파일 읽기
        console.log('📖 데이터 파일 로딩 중...');
        const rawData = fs.readFileSync(dataFilePath, 'utf8');
        const data = JSON.parse(rawData);
        
        if (!data.products || !Array.isArray(data.products)) {
            console.error('❌ 데이터 파일 형식이 올바르지 않습니다.');
            return;
        }
        
        console.log(`✅ ${data.products.length}개 상품 데이터 로드 완료\n`);
        
        const stats = {
            total: data.products.length,
            success: 0,
            notFound: 0,
            error: 0,
            categories: {}
        };
        
        // 각 상품 처리
        for (let i = 0; i < data.products.length; i++) {
            const product = data.products[i];
            const progress = ((i + 1) / data.products.length * 100).toFixed(1);
            
            if (!product.savedImageName || !product.categoryName) {
                console.log(`⚠️  [${progress}%] 건너뜀: 필수 정보 누락 - ${product.productName || 'Unknown'}`);
                stats.error++;
                continue;
            }
            
            try {
                const category = product.categoryName;
                const savedImageName = product.savedImageName;
                const folderName = generateFolderName(savedImageName);
                
                // 카테고리별 통계 초기화
                if (!stats.categories[category]) {
                    stats.categories[category] = { success: 0, notFound: 0, error: 0 };
                }
                
                // 새 폴더 경로 생성
                const categoryPath = path.join(newImagesPath, category);
                const productFolderPath = path.join(categoryPath, folderName);
                
                // 폴더 생성
                fs.mkdirSync(productFolderPath, { recursive: true });
                
                // 원본 이미지 파일 찾기
                const originalImagePath = findImageInOriginalFolder(savedImageName, originalImagesPath);
                
                if (originalImagePath && fs.existsSync(originalImagePath)) {
                    // 새 위치로 복사
                    const newImagePath = path.join(productFolderPath, savedImageName);
                    fs.copyFileSync(originalImagePath, newImagePath);
                    
                    if (i % 100 === 0 || i === data.products.length - 1) {
                        console.log(`✅ [${progress}%] ${category}/${folderName} 생성 완료`);
                    }
                    
                    stats.success++;
                    stats.categories[category].success++;
                } else {
                    console.log(`❌ [${progress}%] 이미지 찾을 수 없음: ${savedImageName}`);
                    // 빈 폴더라도 생성해두고 로그에 기록
                    stats.notFound++;
                    stats.categories[category].notFound++;
                }
                
            } catch (error) {
                console.error(`❌ [${progress}%] 처리 중 오류: ${product.productName}`, error.message);
                stats.error++;
                stats.categories[product.categoryName].error++;
            }
        }
        
        // 결과 요약
        console.log('\n📊 === 재구성 결과 요약 ===');
        console.log(`🔸 총 상품 수: ${stats.total}개`);
        console.log(`✅ 성공: ${stats.success}개 (${(stats.success/stats.total*100).toFixed(1)}%)`);
        console.log(`❌ 이미지 없음: ${stats.notFound}개 (${(stats.notFound/stats.total*100).toFixed(1)}%)`);
        console.log(`🚫 처리 오류: ${stats.error}개 (${(stats.error/stats.total*100).toFixed(1)}%)`);
        
        console.log('\n📋 === 카테고리별 결과 ===');
        for (const [category, categoryStats] of Object.entries(stats.categories)) {
            const total = categoryStats.success + categoryStats.notFound + categoryStats.error;
            console.log(`${category}: 총 ${total}개 | ✅ ${categoryStats.success}개 | ❌ ${categoryStats.notFound}개 | 🚫 ${categoryStats.error}개`);
        }
        
        // 상세 로그 저장
        const reportData = {
            timestamp: new Date().toISOString(),
            summary: stats,
            newStructurePath: newImagesPath,
            originalStructurePath: originalImagesPath
        };
        
        fs.writeFileSync('final_images_restructure_report.json', JSON.stringify(reportData, null, 2));
        console.log('\n💾 상세 결과가 "final_images_restructure_report.json" 파일에 저장되었습니다.');
        console.log(`\n🎉 이미지 폴더 재구성이 완료되었습니다!`);
        console.log(`📁 새 폴더: ${newImagesPath}`);
        
    } catch (error) {
        console.error('❌ 처리 중 오류 발생:', error.message);
    }
}

// 폴더 구조 검증 함수
function validateNewStructure() {
    const newImagesPath = './final_image_v2';
    
    if (!fs.existsSync(newImagesPath)) {
        console.error('❌ 새 이미지 폴더가 존재하지 않습니다.');
        return;
    }
    
    console.log('\n🔍 새 폴더 구조 검증 중...');
    
    const categories = fs.readdirSync(newImagesPath, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);
    
    let totalFolders = 0;
    let totalImages = 0;
    
    for (const category of categories) {
        const categoryPath = path.join(newImagesPath, category);
        const productFolders = fs.readdirSync(categoryPath, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory());
        
        let categoryImages = 0;
        for (const folder of productFolders) {
            const folderPath = path.join(categoryPath, folder.name);
            const images = fs.readdirSync(folderPath)
                .filter(file => /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(file));
            categoryImages += images.length;
        }
        
        console.log(`📁 ${category}: ${productFolders.length}개 폴더, ${categoryImages}개 이미지`);
        totalFolders += productFolders.length;
        totalImages += categoryImages;
    }
    
    console.log(`\n📊 전체: ${totalFolders}개 상품 폴더, ${totalImages}개 이미지`);
}

// 스크립트 실행
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.includes('--validate')) {
        validateNewStructure();
    } else {
        restructureFinalImages().then(() => {
            validateNewStructure();
        });
    }
}

module.exports = { restructureFinalImages, validateNewStructure };