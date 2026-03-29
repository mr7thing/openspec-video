# OpsV 0.3.2 Project 瑙勮寖 (OPSV-PROJECT-0.3.2.md)

鏈鑼冨畾涔変簡 OpenSpec-Video (OpsV) 0.3.2 宸ョ▼涓敮涓€鐨勫叏灞€閰嶇疆涓灑鈥斺€擿videospec/project.md` 鐨勭粨鏋勪笌鍑嗗垯銆?

## 1. 鏍稿績鍝插锛氬叏灞€闄嶇淮 (Global Context Lock)

涓轰簡鏋佸害鍘嬬缉搴曞眰 Agent 鍜岃剼鏈挵鍐欒€呯殑蹇冩櫤璐熸媴锛屽交搴曟秷闄ゅ湪姣忎竴涓暅澶?(Shot) 閲屽弽澶嶉粯鍐欌€滅數褰卞厜娉姐€?k鍒嗚鲸鐜団€濈瓑鍐椾綑琛屼负锛屾垜浠己鍒跺皢杩欎簺**璐┛濮嬬粓鐨勪笂涓嬫枃**鎻愮函鑷虫牴鐩綍鐨?`project.md` 涓€?

杩欐槸鍞竴涓€涓厑璁稿０鏄庡叏灞€娓叉煋鍙傛暟鐨勬枃浠躲€傚簳灞傛瀯寤哄櫒 (`AssetCompiler`) 浼氭棤瑙嗗垎闀滃笀鐨勬兂娉曪紝鍦ㄦ渶缁堢敓鎴?`jobs.json` 鐨?Payload 鏃讹紝**寮哄埗灏嗘澶勭殑鍙傛暟涓庡悗缂€鍨叆姣忎竴涓暅澶寸殑鎵ц涓婁笅鏂囦腑**銆?

## 2. 鏂囦欢缁撴瀯涓?YAML 瑙勮寖

`project.md` 蹇呴』瀛樻斁浜庡伐绋嬬殑 `videospec/` 鏍圭洰褰曚笅锛屽苟浠?YAML Frontmatter 寮€澶淬€?

### 2.1 YAML Frontmatter

杩欓儴鍒嗗畾涔夋墍鏈夌殑鐜鍙傛暟銆?

```yaml
---
aspect_ratio: "16:9" # 寮哄埗鐨勭敾骞呰缃?(16:9 妯睆锛?:16 绔栧睆鐭棰?
engine: "nano_banana_pro" # 榛樿浣跨敤鐨勭敓鍥?瑙嗛妯″瀷寮曟搸
global_style_postfix: "cinematic lighting, ultra detailed, masterpiece, arri alexa 65" # 鍏ㄥ眬寮哄寲鐨勯鏍煎悗缂€
resolution: "2K" # 鍩哄噯鍒嗚鲸鐜?
---
```

### 2.2 姝ｆ枃锛氳祫浜ц姳鍚嶅唽 (Asset Roster)

鍦?YAML 鍧楃粨鏉熶箣鍚庯紝鏄竴浠?Markdown 鏍煎紡鐨勬竻鍗曘€?
**瀹冪殑鍞竴浣滅敤鏄細瀹ｅ憡鏈伐绋嬫嫢鏈夊摢浜涘悎娉曠殑 `@` 瀹炰綋璧勪骇銆?*
杩欐棦鑳借浜虹被瀵兼紨涓€鐩簡鐒讹紝鍙堟槸搴曞眰 Agent锛堜緥濡?`opsv-director`锛夋牎楠屽垎闀滃墽鏈槸鍚﹀嚭鐜拌秺鐣屾垨鈥滄棤涓敓鏈夆€濊祫浜х殑閲嶈瀛楀吀銆?

娓呭崟搴旀寜浠ヤ笅鏍囧噯鍒嗙被鍒楀嚭鎵€鏈夊疄浣擄紙蹇呴』涓庡叾 `.md` 澹版槑鏂囦欢涓殑 YAML `name` 灞炴€т繚鎸佺粷瀵逛竴鑷达級锛?

```markdown
# Asset Manifest

## Main Characters (涓昏瑙掕壊)
- `@role_K`
- `@role_Emma`

## Extras (缇ゆ紨/娆¤瑙掕壊)
- `@role_ThugA`
- `@role_ThugB`

## Scenes (绌洪棿鍦烘櫙)
- `@scene_NeonBar`
- `@scene_Wasteland`

## Props (鍏抽敭閬撳叿)
- `@prop_Gun`
- `@prop_Kite`
```

## 3. 璁捐鍒剁害 (Constraints)

1. **鍞竴鎬?*锛氫竴涓?OpsV 宸ョ▼鍙兘鏈変竴涓縺娲荤殑 `project.md`銆?
2. **鍚堟硶鎬у墠鍝?*锛氬鏋滄煇涓疄浣擄紙濡?`@prop_Car`锛夋湭鍦ㄨ繖涓姳鍚嶅唽涓櫥璁帮紝閭ｄ箞搴曞眰鐨勫鏌?Agent 鐞嗗簲瑙嗕负璇硶杩濊锛屼簣浠ラ┏鍥炪€?
3. **娑堥櫎鍐椾綑**锛氬紑鍙戣€呭湪缂栧啓 `videospec/shots/*.md` 鏃讹紝濡傛灉璇曞浘缁欏満鏅姞鍐?`cinematic lighting`锛屽簳灞傜紪璇戝櫒搴斿綋瑙嗕负鍧忓搧鍛筹紝鍥犱负杩欏湪 `global_style_postfix` 涓凡缁忔彁渚涗簡绯荤粺绾х殑淇濋殰銆?

