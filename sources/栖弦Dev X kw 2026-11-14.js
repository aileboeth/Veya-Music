/*!
 * @name 栖弦Dev X kw
 * @description 酷我全平台
 * @version 橘子·最后更新·2026-11-14
 * @author 
 */
const { EVENT_NAMES, request, on, send } = globalThis.lx;

function req(url, opts) {
    return new Promise((resolve, reject) => {
        request(url, Object.assign({ timeout: 8000 }, opts || {}), function (err, res) {
            if (err) return reject(new Error('请求错误: ' + err.message));
            let body = res && res.body;
            if (typeof body === 'string') {
                const t = body.trim();
                if (t.charAt(0) === '{' || t.charAt(0) === '[') { try { body = JSON.parse(t); } catch (e) {} }
            }
            resolve(body);
        });
    });
}

function getInterLen(s1, s2) {
    let a = s1.split(''), b = s2.split(''), count = 0;
    for (let i = 0; i < a.length; i++) {
        const idx = b.indexOf(a[i]);
        if (idx !== -1) { count++; b.splice(idx, 1); }
    }
    return count;
}

function getSim(s1, s2) {
    if (!s1 || !s2) return 0;
    if (s1 === s2) return 1.0;
    const maxLen = Math.max(s1.length, s2.length);
    return maxLen === 0 ? 0 : getInterLen(s1, s2) / maxLen;
}

async function searchKuwo(keyword) {
    const url = 'http://search.kuwo.cn/r.s?client=kt&all=' + encodeURIComponent(keyword) +
        '&pn=0&rn=30&uid=794762570&ver=kwplayer_ar_9.2.2.1&vipver=1' +
        '&show_copyright_off=1&newver=1&ft=music&cluster=0&strategy=2012' +
        '&encoding=utf8&rformat=json&vermerge=1&mobi=1&issubtitle=1&_=' + Date.now();
    try {
        let res = await req(url, { method: 'GET', headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (typeof res === 'string') {
            let s = res.trim();
            if (s.charAt(0) === '(') s = s.slice(1);
            if (s.charAt(s.length - 1) === ')') s = s.slice(0, -1);
            try { res = JSON.parse(s); } catch (e) { try { res = JSON.parse(s.replace(/'/g, '"')); } catch (e2) {} }
        }
        return (res && res.abslist) ? res.abslist : [];
    } catch (e) {
        return [];
    }
}

async function getKuwoUrl(rid, q) {
    const map = { master: '20900kmflac', atmos_plus: '20501kmflac', atmos: '20201kmflac', hires: '2000kflac', flac24bit: '2000kflac', flac: '2000kflac', '320k': '320kmp3', '128k': '128kmp3' };
    const br = map[q] || '320kmp3';
    const url = 'http://nmobi.kuwo.cn/mobi.s?f=web&user=0&source=kwplayerhd_ar_6.6.6.6_tianbao_T1A_qirui.apk&type=convert_url_with_sign&rid=' + encodeURIComponent(rid) + '&br=' + encodeURIComponent(br);
    const res = await req(url, { method: 'GET', headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android) AppleWebKit/537.36' } });
    return res && res.data && res.data.url ? res.data.url : null;
}

async function syncKwTest(mi, q) {
    const songName = mi.title || mi.name || '';
    const singerName = mi.artist || mi.singer || '';
    
    let expectedDuration = 0;
    if (mi.interval) {
        if (typeof mi.interval === 'string' && mi.interval.indexOf(':') > -1) {
            const parts = mi.interval.split(':');
            if (parts.length === 2) expectedDuration = (parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10)) * 1000;
        } else {
            expectedDuration = Number(mi.interval || 0);
            if (expectedDuration > 0 && expectedDuration < 10000) expectedDuration *= 1000;
        }
    }

    const mainArtist = String(singerName).split(/[\/&、,，]/)[0].trim();
    const stripHtml = (s) => String(s || '').replace(/&nbsp;/g, ' ').replace(/<[^>]+>/g, '').trim();
    const wT = stripHtml(songName).toLowerCase().replace(/\s+/g, '');
    const wA = stripHtml(mainArtist).toLowerCase().replace(/\s+/g, '');

    function analyzeList(list) {
        let strictRid = '', strictMax = -1;
        let looseRid = '', looseMax = -1;

        for (let i = 0; i < list.length; i++) {
            const o = list[i];
            const curRid = o.MUSICRID ? String(o.MUSICRID).replace(/^MUSIC_/, '') : (o.DC_TARGETID || o.rid || '');
            if (!curRid) continue;

            const rTitle = stripHtml(o.SONGNAME || o.NAME || '').toLowerCase().replace(/\s+/g, '');
            const rArtist = stripHtml(o.ARTIST || o.FARTIST || '').toLowerCase().replace(/\s+/g, '');
            const rDuration = Number(o.DURATION || 0) * 1000;

            const tScore = getSim(wT, rTitle);
            const aScore = getSim(wA, rArtist);

            if (tScore > 0 && aScore > 0) {
                if (wA && aScore < 0.3) continue;

                const totalScore = (tScore + aScore) / 2;

                if (totalScore > looseMax) {
                    looseMax = totalScore;
                    looseRid = curRid;
                }

                let isDurationOk = true;
                if (expectedDuration > 0 && rDuration > 0) {
                    if (Math.abs(rDuration - expectedDuration) > 5000) {
                        isDurationOk = false;
                    }
                }

                if (isDurationOk && totalScore > strictMax) {
                    strictMax = totalScore;
                    strictRid = curRid;
                }
            }
        }
        return { strictRid, looseRid, looseMax };
    }

    let finalRid = '';
    let res1 = null;
    let res2 = null;

    if (songName && mainArtist) {
        const list1 = await searchKuwo(songName + ' ' + mainArtist);
        if (list1.length) {
            res1 = analyzeList(list1);
            if (res1.strictRid) finalRid = res1.strictRid;
        }
    }

    if (!finalRid && songName) {
        const list2 = await searchKuwo(songName);
        if (list2.length) {
            res2 = analyzeList(list2);
            if (res2.strictRid) finalRid = res2.strictRid;
        }
    }

    if (!finalRid) {
        const score1 = res1 ? res1.looseMax : -1;
        const score2 = res2 ? res2.looseMax : -1;

        if (score1 > score2 && res1 && res1.looseRid) {
            finalRid = res1.looseRid;
        } else if (score2 >= score1 && res2 && res2.looseRid) {
            finalRid = res2.looseRid;
        }
    }

    if (!finalRid) throw new Error('未匹配到合适音源');

    const url = await getKuwoUrl(finalRid, q);
    if (!url) throw new Error('酷我取链失败');
    return url;
}

const sourceConfig = {
    tx: { name: 'QQ音乐', type: 'music', actions: ['musicUrl'], qualitys: ['128k', '320k', 'flac', 'flac24bit', 'hires', 'master', 'atmos', 'atmos_plus'] },
    wy: { name: '网易云', type: 'music', actions: ['musicUrl'], qualitys: ['128k', '320k', 'flac', 'flac24bit', 'hires', 'master', 'atmos', 'atmos_plus'] },
    kg: { name: '酷狗', type: 'music', actions: ['musicUrl'], qualitys: ['128k', '320k', 'flac', 'flac24bit', 'hires', 'master', 'atmos', 'atmos_plus'] },
    kw: { name: '酷我', type: 'music', actions: ['musicUrl'], qualitys: ['128k', '320k', 'flac', 'flac24bit', 'hires', 'master', 'atmos', 'atmos_plus'] },
    mg: { name: '咪咕', type: 'music', actions: ['musicUrl'], qualitys: ['128k', '320k', 'flac', 'flac24bit', 'hires', 'master', 'atmos', 'atmos_plus'] },
    qs: { name: '汽水音乐', type: 'music', actions: ['musicUrl'], qualitys: ['128k', '320k', 'flac', 'flac24bit', 'hires', 'master', 'atmos', 'atmos_plus'] },
};

on(EVENT_NAMES.request, async function (payload) {
    if (payload.action !== 'musicUrl') return Promise.reject(new Error('action not support'));
    
    const mi = payload.info.musicInfo;
    const q = payload.info.type || '320k';

    if (payload.source === 'kw') {
        let rid = mi.songmid || mi.id || '';
        rid = String(rid).replace(/^kw_/, '');
        if (!rid) throw new Error('缺少酷我 ID');
        
        const url = await getKuwoUrl(rid, q);
        if (!url) throw new Error('酷我直连失败');
        return url;
    }

    return await syncKwTest(mi, q);
});

send(EVENT_NAMES.inited, {
    openDevTools: false,
    sources: sourceConfig,
});