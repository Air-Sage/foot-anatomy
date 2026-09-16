import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { createRendering, tissueMaterial } from "./rendering.js";

const MODEL_URL = "./assets/open3dmodel/lower-limb.glb";
const SELECTED_EMISSIVE = 0x75ad91;
const HOVER_EMISSIVE = 0x97b3a0;
const OUTLINE_COLOR = 0x508c70;
const SELECTED_EMISSIVE_INTENSITY = 0.24;
const HOVER_EMISSIVE_INTENSITY = 0.07;
const XRAY_OPACITY = 0.22;
const GLOBAL_XRAY_OPACITY = 0.42;

const LAYER_CONFIG = {
  bone: { label: "骨骼", color: "#b9a582", groups: ["Bones"] },
  cartilage: { label: "软骨", color: "#8fc6cb", groups: ["Cartilages"] },
  ligament: { label: "韧带", color: "#b5a05f", groups: ["Ligaments"] },
  fascia: { label: "筋膜", color: "#99a68e", groups: ["Fascia"] },
  muscle: { label: "肌肉", color: "#c84542", groups: ["Muscles"] },
  artery: { label: "动脉", color: "#d64236", groups: ["Arteries"] },
  vein: { label: "静脉", color: "#3868d6", groups: ["Veins"] },
  nerve: { label: "神经", color: "#c5a449", groups: ["Nerves"] },
  bursa: { label: "滑囊", color: "#8ca7a4", groups: ["Bursae"] },
};

const LAYER_KEYS = Object.keys(LAYER_CONFIG);

const GROUP_TO_LAYER = Object.entries(LAYER_CONFIG).reduce(
  (map, [layer, config]) => {
    (config.groups || []).forEach((group) => {
      map[group.toLowerCase()] = layer;
    });
    return map;
  },
  {},
);

const DETAIL_OVERRIDES = [
  {
    layers: ["artery"],
    match: /artery|arteries|arterial|arch|branch|vessel/i,
    badge: "动脉",
    summary:
      "这是下肢动脉系统中的血管结构，属于从股动脉、腘动脉、胫前/胫后动脉到足背和足底分支的供血通路。",
    role: "向小腿、踝、足背和足底组织输送含氧血液。",
    location:
      "沿骨间膜、踝前方、踝管或足底筋膜深面等通道走行，具体路径取决于该动脉分支名称。",
  },
  {
    layers: ["vein"],
    match: /vein|venous|saphenous|tributary/i,
    badge: "静脉",
    summary:
      "这是下肢静脉系统中的回流结构，可能属于深静脉、浅静脉或足背/足底静脉网。",
    role: "把足部、小腿和大腿的静脉血回流至近端静脉系统。",
    location:
      "浅静脉多位于皮下通路，深静脉通常伴行动脉，足部可见足背静脉弓、足底静脉弓和趾静脉分支。",
  },
  {
    layers: ["nerve"],
    match: /nerve|nerves|neural|cutaneous|digital branch|plantar branch/i,
    badge: "神经",
    summary:
      "这是下肢神经系统的一部分，来自坐骨神经、胫神经、腓总神经及其足部终末分支。",
    role: "传导运动、感觉和本体感觉信号，支配足踝肌肉并提供皮肤感觉。",
    location:
      "分布在腘窝、腓骨颈、踝管、足背和足底等神经通道，具体位置随分支名称变化。",
  },
  {
    layers: ["cartilage"],
    match: /art cart|cartilage|meniscus|labrum|annulus|synovial/i,
    badge: "软骨",
    summary:
      "这是关节软骨、半月板、关节唇或相关滑膜/纤维软骨结构，不是骨本体。",
    role: "降低关节面摩擦、分散压力，并帮助维持关节匹配和运动平滑。",
    location:
      "位于相邻骨性关节面之间或关节囊内，名称中的骨名表示它贴附或覆盖的关节面。",
  },
  {
    layers: ["ligament"],
    match:
      /talofibular|calcaneofibular|tibiofibular|tibiotalar|tibionavicular|tibiocalcaneal|cruciate|collateral|ligament|capsule|interosseous membrane|obturator membrane/i,
    badge: "韧带",
    summary:
      "这是连接骨与骨、关节囊或骨间膜相关的稳定结构，不应按名称中的某一块骨来解释。",
    role: "限制异常活动、维持踝关节/膝关节/足部关节稳定，并帮助骨性结构保持正确对位。",
    location:
      "跨越名称中提示的相邻骨或关节区域，例如距腓、跟腓、胫腓或胫距相关区域。",
  },
  {
    layers: ["ligament", "muscle"],
    match: /calcaneal tendon|achilles|tendon/i,
    badge: "肌腱",
    summary: "这是肌腱结构，不是骨骼。肌腱把肌肉产生的力量传递到骨性附着点。",
    role: "传递肌肉收缩力量，帮助完成踝跖屈、足趾运动或膝踝联合动作。",
    location: "沿肌腹远端向骨性止点延续；跟腱位于小腿后方，向下止于跟骨粗隆。",
  },
  {
    layers: ["ligament", "muscle"],
    match: /plantar aponeurosis/i,
    badge: "筋膜",
    summary: "跖腱膜是足底筋膜结构，从跟骨向前足呈扇形展开。",
    role: "维持足弓张力，步态推蹬时帮助足底储能和回弹。",
    location: "位于足底浅层，覆盖足底肌群下方并向跖骨头分束。",
  },
  {
    layers: ["ligament", "muscle"],
    match: /fascia|retinaculum|aponeurosis/i,
    badge: "筋膜/支持带",
    summary: "这是筋膜、腱膜或支持带结构，属于软组织约束和分隔系统。",
    role: "包绕或分隔肌群，固定肌腱走行，并在踝足部运动时减少肌腱移位。",
    location: "多位于皮下深面、肌群表面或踝部肌腱转折处，具体位置由名称决定。",
  },
  {
    layers: ["bone"],
    match: /^tibia$/i,
    badge: "骨骼",
    summary:
      "胫骨是真实模型中的小腿内侧主承重骨，近端形成膝关节，远端形成内踝和踝穴的一部分。",
    role: "承担大部分下肢轴向负重，并为小腿前、后、深层肌群和胫腓联合提供骨性附着。",
    location: "位于小腿内侧，和外侧腓骨平行，下端与距骨组成踝关节。",
  },
  {
    layers: ["bone"],
    match: /^fibula$/i,
    badge: "骨骼",
    summary:
      "腓骨是真实模型中的小腿外侧长骨，远端形成外踝，是外侧踝韧带的重要附着基础。",
    role: "提供肌肉和韧带附着点，参与踝关节外侧稳定；承重比例小于胫骨。",
    location: "位于小腿外侧，近端靠近膝外侧，远端下行形成外踝。",
  },
  {
    layers: ["bone"],
    match: /^calcaneus$/i,
    badge: "骨骼",
    summary: "跟骨位于后足，是足跟主要骨性结构；跟腱和多条足底结构附着于此。",
    role: "传递地面反作用力，形成后足杠杆，并参与距下关节运动。",
    location: "位于距骨下方和足跟后下方。",
  },
  {
    layers: ["bone"],
    match: /^talus$/i,
    badge: "骨骼",
    summary: "距骨位于踝穴内，是真实模型中连接小腿和足部的关键骨。",
    role: "承接胫腓骨负荷并传递到跟骨、中足，同时参与踝关节背屈和跖屈。",
    location: "位于胫骨、腓骨下端与跟骨之间。",
  },
  {
    layers: ["muscle"],
    match: /gastrocnemius/i,
    badge: "肌肉",
    summary:
      "腓肠肌位于小腿后浅层，真实模型中分为内侧头和外侧头，并向下汇入跟腱。",
    role: "强力跖屈踝关节，并协助膝关节屈曲，是跑跳推蹬的主要动力来源。",
    location: "起于股骨远端后方，覆盖小腿后侧浅层，向下过渡至跟腱。",
  },
  {
    layers: ["muscle"],
    match: /soleus/i,
    badge: "肌肉",
    summary: "比目鱼肌位于腓肠肌深层，是维持站立姿势和持续跖屈的重要肌肉。",
    role: "稳定踝关节、持续抗重力跖屈，并和腓肠肌共同形成跟腱系统。",
    location: "位于小腿后方深层，主要贴近胫骨、腓骨后面。",
  },
  {
    layers: ["muscle"],
    match: /tibialis anterior/i,
    badge: "肌肉",
    summary: "胫骨前肌位于小腿前室，真实模型中从胫骨外侧面下行至足内侧。",
    role: "踝背屈和足内翻，步态摆动期帮助脚尖离地。",
    location: "位于小腿前外侧，肌腱跨过踝前方进入足内侧。",
  },
  {
    layers: ["muscle"],
    match: /tibialis posterior/i,
    badge: "肌肉",
    summary: "胫骨后肌位于小腿深后室，是维持足弓和足内翻的重要肌肉。",
    role: "参与踝跖屈、足内翻和内侧纵弓动态支撑。",
    location: "位于小腿后方深层，肌腱经内踝后方进入足底内侧。",
  },
];

const EXACT_NAME_TRANSLATIONS = {
  "Abductor hallucis": "拇展肌",
  "Acetabular labrum": "髋臼唇",
  "Adductor brevis": "短收肌",
  "Adductor canal": "收肌管",
  "Adductor hiatus": "收肌腱裂孔",
  "Adductor longus": "长收肌",
  "Adductor magnus": "大收肌",
  "Adductor minimus overlay": "小收肌覆盖层",
  "Anterior cruciate ligament": "前交叉韧带",
  "Anterior femoral cutaneous vein": "股前皮静脉",
  "Arcuate artery": "弓状动脉",
  "Arcuate ligament": "弓状韧带",
  "Articularis genus": "膝关节肌",
  "Bifurcatum ligament": "分叉韧带",
  "Calcaneal tendon": "跟腱",
  "Calcaneocuboid ligament": "跟骰韧带",
  "Calcaneofibular ligament": "跟腓韧带",
  "Calcaneonavicular ligament": "跟舟韧带",
  Calcaneus: "跟骨",
  "Capsule of talocrural joint": "距小腿关节囊",
  "Cervical ligament": "颈韧带",
  "Coccygeus muscle": "尾骨肌",
  Coccyx: "尾骨",
  "Common fibular nerve": "腓总神经",
  "Crural fascia": "小腿筋膜",
  "Cuboid bone": "骰骨",
  "Cutaneous br of Anterior br of Obturator nerve": "闭孔神经前支皮支",
  "Deep artery of the thigh": "股深动脉",
  "Deep femoral vein": "股深静脉",
  "Deep fibular nerve": "腓深神经",
  "Deep Infrapatellar bursa": "深髌下滑囊",
  "Deep plantar arch": "足底深弓",
  "Deep plantar artery": "足底深动脉",
  "Deep transverse metatarsal ligament": "跖骨深横韧带",
  "Descending part of Iliofemoral ligament": "髂股韧带降部",
  "Descending genicular artery": "膝降动脉",
  "Dorsal pedis artery": "足背动脉",
  "Dorsal venous arch of foot": "足背静脉弓",
  "Dorsal venous network of foot": "足背静脉网",
  "Extensor digitorum brevis": "趾短伸肌",
  "Extensor digitorum longus": "趾长伸肌",
  "Extensor hallucis brevis": "拇短伸肌",
  "Extensor hallucis longus": "拇长伸肌",
  "Fascia lata": "阔筋膜",
  "Femoral artery": "股动脉",
  "Femoral canal": "股管",
  "Femoral nerve": "股神经",
  "Femoral ring": "股环",
  "Femoral triangle": "股三角",
  "Femoral vein": "股静脉",
  Femur: "股骨",
  "Fibrous sheath of toes": "趾纤维鞘",
  Fibula: "腓骨",
  "Fibular artery": "腓动脉",
  "Fibular collateral ligament": "腓侧副韧带",
  "Fibular vein": "腓静脉",
  "Fibularis brevis muscle": "腓骨短肌",
  "Fibularis longus muscle": "腓骨长肌",
  "Fibularis tertius muscle": "第三腓骨肌",
  "Flexor digiti minimi brevis of foot": "足小趾短屈肌",
  "Flexor digitorum brevis": "趾短屈肌",
  "Flexor digitorum longus": "趾长屈肌",
  "Flexor hallucis longus": "拇长屈肌",
  "Flexor retinaculum of ankle": "踝屈肌支持带",
  "Gluteal aponeurosis": "臀腱膜",
  "Gluteus maximus muscle": "臀大肌",
  "Gluteus medius muscle": "臀中肌",
  "Gluteus minimus muscle": "臀小肌",
  "Gracilis muscle": "股薄肌",
  "Great saphenous vein": "大隐静脉",
  "Hip bone": "髋骨",
  "Hip joint capsule": "髋关节囊",
  "Iliacus muscle": "髂肌",
  "Ilioinguinal nerve": "髂腹股沟神经",
  "Iliolumbar ligament": "髂腰韧带",
  "Iliopectineal bursa": "髂耻滑囊",
  "Iliotibial tract": "髂胫束",
  "Inferior extensor retinaculum": "下伸肌支持带",
  "Inferior fibular retinaculum": "下腓骨肌支持带",
  "Inferior gemellus muscle": "下孖肌",
  "Inferior gluteal nerve": "臀下神经",
  "Inferior clunial br of post cutaneous nerve of the thigh":
    "股后皮神经臀下皮支",
  "Infrapatellar fat pad": "髌下脂肪垫",
  "Intermediate cuneiform bone": "中间楔骨",
  "Interosseous membrane of leg": "小腿骨间膜",
  "Interpubic disc": "耻骨间盘",
  "Intersesamoid ligament": "籽骨间韧带",
  "Ishciofemoral ligament": "坐股韧带",
  "Lateral cuneiform bone": "外侧楔骨",
  "Lateral cutaneous branch of Iliohypogaticus nerve": "髂腹下神经外侧皮支",
  "Lateral femoral intermuscular septum": "股外侧肌间隔",
  "Lateral head of flexor hallucis brevis": "拇短屈肌外侧头",
  "Lateral head of gastrocnemius": "腓肠肌外侧头",
  "Lateral meniscus": "外侧半月板",
  "Lateral plantar artery": "足底外侧动脉",
  "Lateral plantar nerve": "足底外侧神经",
  "Lateral plantar vein": "足底外侧静脉",
  "Lateral sural cutaneous nerve": "腓肠外侧皮神经",
  "Ligament of head of femur": "股骨头韧带",
  "Long head of biceps femoris": "股二头肌长头",
  "Long plantar ligament": "足底长韧带",
  "Lumbrical muscles of foot": "足蚓状肌",
  "Medial collatertal ligament": "内侧副韧带",
  "Medial cuneiform bone": "内侧楔骨",
  "Medial femoral intermuscular septum": "股内侧肌间隔",
  "Medial head of flexor hallucis brevis": "拇短屈肌内侧头",
  "Medial head of gastrocnemius": "腓肠肌内侧头",
  "Medial meniscus": "内侧半月板",
  "Medial plantar artery": "足底内侧动脉",
  "Medial plantar nerve": "足底内侧神经",
  "Medial plantar vein": "足底内侧静脉",
  "Medial sural cutaneous nerve": "腓肠内侧皮神经",
  "Navicular bone": "舟骨",
  "Oblique popliteal ligament": "腘斜韧带",
  "Obturator externus": "闭孔外肌",
  "Obturator internus": "闭孔内肌",
  "Obturator membrane": "闭孔膜",
  "Obturator nerve": "闭孔神经",
  "Opponens digiti minimi muscle of foot": "足小趾对掌肌",
  Patella: "髌骨",
  "Pectineus muscle": "耻骨肌",
  "Pes anserine bursa": "鹅足滑囊",
  "Pes anserinus common tendon": "鹅足共同腱",
  "Piriformis muscle": "梨状肌",
  "Plantar aponeurosis": "跖腱膜",
  "Plantar venous arch": "足底静脉弓",
  "Plantaris muscle": "跖肌",
  "Plexus lumbaris": "腰丛",
  "Popliteal artery": "腘动脉",
  "Popliteal vein": "腘静脉",
  "Popliteus muscle": "腘肌",
  "Posterior cutaneous nerve of the thigh": "股后皮神经",
  "Posterior cruciate ligament": "后交叉韧带",
  "Psoas major": "腰大肌",
  "Psoas minor": "腰小肌",
  "Pubofemoral ligament": "耻股韧带",
  "Quadratus femoris muscle": "股方肌",
  "Quadratus plantae muscle": "足底方肌",
  "Quadriceps common tendon and patellar ligament": "股四头肌共同腱与髌韧带",
  "Rectus femoris": "股直肌",
  "Sacrospinous ligament": "骶棘韧带",
  "Sacrotuberal ligament": "骶结节韧带",
  Sacrum: "骶骨",
  "Saphenous opening": "隐静脉裂孔",
  "Sartorius muscle": "缝匠肌",
  "Schiatic nerve": "坐骨神经",
  "Sciatic bursa of obturator internus": "闭孔内肌坐骨滑囊",
  "Semimembranosus muscle": "半膜肌",
  "Semimembranosus muscle tendon": "半膜肌腱",
  "Semitendinosus muscle": "半腱肌",
  "Sesamoid bones of foot": "足籽骨",
  "Short head of biceps femoris": "股二头肌短头",
  "Small saphenous vein": "小隐静脉",
  "Soleus muscle": "比目鱼肌",
  "Superior extensor retinaculum of ankle": "踝上伸肌支持带",
  "Superior fibular retinaculum": "上腓骨肌支持带",
  "Superior gemellus muscle": "上孖肌",
  "Superior gluteal nerve": "臀上神经",
  "Sural artery": "腓肠动脉",
  "Sural nerve": "腓肠神经",
  "Sural vein": "腓肠静脉",
  "Symphysis of sacrococcygeal joint": "骶尾关节联合",
  "Sup, Inf, Ant, Post, Pubic ligaments": "上、下、前、后及耻骨韧带",
  "Talonavicular ligament": "距舟韧带",
  Talus: "距骨",
  "Tendinous arch of soleus": "比目鱼肌腱弓",
  "Tensor fasciae latae": "阔筋膜张肌",
  Tibia: "胫骨",
  "Tibial nerve": "胫神经",
  "Tibialis anterior muscle": "胫骨前肌",
  "Tibialis posterior muscle": "胫骨后肌",
  "Tibiocalcaneal ligament": "胫跟韧带",
  "Tibionavicular ligament": "胫舟韧带",
  "Transverse acetabular ligament": "髋臼横韧带",
  "Transverse ligament of knee": "膝横韧带",
  "Transverse tibiofibular ligament": "胫腓横韧带",
  "Vastus intermedius muscle": "股中间肌",
  "Vastus lateralis muscle": "股外侧肌",
  "Vastus medialis muscle": "股内侧肌",
  "Zona orbicularis of hip joint": "髋关节轮匝带",
};

const PHRASE_TRANSLATIONS = [
  ["posterior cutaneous nerve of the thigh", "股后皮神经"],
  ["posterior cutaneous nerve of thigh", "股后皮神经"],
  ["lateral circumflex femoral artery", "旋股外侧动脉"],
  ["lateral circumflex femoral vein", "旋股外侧静脉"],
  ["medial circumflex femoral artery", "旋股内侧动脉"],
  ["medial circumflex femoral vein", "旋股内侧静脉"],
  ["superficial circumflex iliac artery", "旋髂浅动脉"],
  ["superficial circumflex iliac vein", "旋髂浅静脉"],
  ["superficial external pudendal artery", "阴部外浅动脉"],
  ["superficial external pudendal vein", "阴部外浅静脉"],
  ["superficial epigastric artery", "腹壁浅动脉"],
  ["superficial epigastric vein", "腹壁浅静脉"],
  ["posterior tibial artery", "胫后动脉"],
  ["posterior tibial vein", "胫后静脉"],
  ["anterior tibial artery", "胫前动脉"],
  ["anterior tibial vein", "胫前静脉"],
  ["common fibular nerve", "腓总神经"],
  ["deep fibular nerve", "腓深神经"],
  ["superficial fibular nerve", "腓浅神经"],
  ["genitofemoral nerve", "生殖股神经"],
  ["iliohypogastric nerve", "髂腹下神经"],
  ["iliohypogaticus nerve", "髂腹下神经"],
  ["iliofemoral ligament", "髂股韧带"],
  ["sacro-iliac ligament", "骶髂韧带"],
  ["sacroiliac joint", "骶髂关节"],
  ["sacrococcygeal joint", "骶尾关节"],
  ["proximal tibiofibular joint", "近侧胫腓关节"],
  ["talofibular joint", "距腓关节"],
  ["talocrural joint", "距小腿关节"],
  ["metatarsophalangeal joints", "跖趾关节"],
  ["distal interphalangeal joints", "远侧趾间关节"],
  ["proximal interphalangeal joints", "近侧趾间关节"],
  ["deep plantar arch", "足底深弓"],
  ["dorsal venous arch", "背侧静脉弓"],
  ["dorsal venous network", "背侧静脉网"],
  ["femoral neck vessels", "股骨颈血管"],
  ["great saphenous vein", "大隐静脉"],
  ["small saphenous vein", "小隐静脉"],
  ["biceps femoris", "股二头肌"],
  ["gastrocnemius muscle", "腓肠肌"],
  ["flexor hallucis brevis", "拇短屈肌"],
  ["adductor hallucis", "拇收肌"],
  ["fibularis muscles", "腓骨肌"],
  ["fibularis longus", "腓骨长肌"],
  ["fibularis tertius", "第三腓骨肌"],
  ["extensor digitorum longus", "趾长伸肌"],
  ["flexor digitorum longus", "趾长屈肌"],
  ["extensor hallucis longus", "拇长伸肌"],
  ["flexor hallucis longus", "拇长屈肌"],
  ["tibialis anterior", "胫骨前肌"],
  ["tibialis posterior", "胫骨后肌"],
  ["obturator internus", "闭孔内肌"],
  ["gluteus maximus", "臀大肌"],
  ["gluteus medius", "臀中肌"],
  ["gluteus minimus", "臀小肌"],
  ["lateral plantar nerve", "足底外侧神经"],
  ["medial plantar nerve", "足底内侧神经"],
  ["lateral plantar artery", "足底外侧动脉"],
  ["medial plantar artery", "足底内侧动脉"],
  ["lateral plantar vein", "足底外侧静脉"],
  ["medial plantar vein", "足底内侧静脉"],
  ["dorsal digital branches", "足背趾支"],
  ["dorsal digital metatarsal arteries", "足背跖趾动脉"],
  ["dorsal digital arteries of foot", "足背趾动脉"],
  ["dorsal digital veins of foot", "足背趾静脉"],
  ["dorsal metatarsal ligaments", "跖背韧带"],
  ["plantar metatarsal ligaments", "跖底韧带"],
  ["superficial transverse metatarsal ligament", "跖骨浅横韧带"],
  ["proper plantar digital branches", "足底固有趾支"],
  ["common plantar digital nerves", "足底总趾神经"],
  ["plantar digital veins", "足底趾静脉"],
  ["dorsal digital veins", "足背趾静脉"],
  ["dorsal digital arteries", "足背趾动脉"],
  ["dorsal metatarsal arteries", "跖背动脉"],
  ["dorsal metatarsal veins", "跖背静脉"],
  ["plantar metatarsal arteries", "跖底动脉"],
  ["plantar metatarsal veins", "跖底静脉"],
  ["plantar interossei muscles", "足底骨间肌"],
  ["dorsal interossei muscles", "足背骨间肌"],
  ["lumbrical muscles", "蚓状肌"],
  ["annular ligaments", "环状韧带"],
  ["cruciform ligaments", "十字韧带"],
  ["interosseous ligaments", "骨间韧带"],
  ["tarsometatarsal ligaments", "跗跖韧带"],
  ["cuneometatarsal", "楔跖"],
  ["intercuneiform", "楔骨间"],
  ["cuneonavicular", "楔舟"],
  ["cuneocuboid", "楔骰"],
  ["cuboidonavicular", "骰舟"],
  ["cuboideonavicular", "骰舟"],
  ["calcaneocuboid", "跟骰"],
  ["calcaneonavicular", "跟舟"],
  ["talocalcaneal", "距跟"],
  ["talofibular", "距腓"],
  ["tibiofibular", "胫腓"],
  ["tibiotalar", "胫距"],
  ["tibiospring", "胫弹簧"],
  ["tibiocalcaneal", "胫跟"],
  ["tibionavicular", "胫舟"],
  ["meniscofemoral", "半月板股"],
  ["patellar retinaculum", "髌支持带"],
  ["extensor retinaculum", "伸肌支持带"],
  ["fibular retinaculum", "腓骨肌支持带"],
  ["tendon sheath", "腱鞘"],
  ["tendinous sheath", "腱鞘"],
  ["vaginae tendinum", "腱鞘"],
  ["synovial sheaths", "滑膜鞘"],
  ["synovial membranes", "滑膜"],
  ["intermuscular septum", "肌间隔"],
  ["intermuscular", "肌间"],
  ["interosseus", "骨间"],
  ["interossea", "骨间"],
  ["intercornual", "角间"],
  ["subtendinous bursa", "腱下滑囊"],
  ["subcutaneous bursa", "皮下滑囊"],
  ["trochanteric bursa", "转子滑囊"],
  ["prepatellar bursa", "髌前滑囊"],
  ["infrapatellar bursa", "髌下滑囊"],
  ["calcaneal bursa", "跟骨滑囊"],
  ["genicular artery", "膝动脉"],
  ["genicular vein", "膝静脉"],
  ["malleolar artery", "踝动脉"],
  ["malleolar branches", "踝支"],
  ["marginal vein", "缘静脉"],
  ["distal end", "远端"],
  ["proximal end", "近端"],
  ["distal phalanges", "远节趾骨"],
  ["middle phalanges", "中节趾骨"],
  ["proximal phalanges", "近节趾骨"],
  ["semimembranosus", "半膜肌"],
  ["semitendinosus", "半腱肌"],
  ["abductor digiti minimi", "小趾展肌"],
  ["saphenous", "隐"],
  ["cutaneous", "皮"],
  ["genital", "生殖"],
  ["clunial", "臀皮"],
  ["crural", "小腿"],
  ["rami", "支"],
  ["piriformis", "梨状肌"],
  ["iliacus", "髂肌"],
  ["sartorius", "缝匠肌"],
  ["gluteal", "臀"],
  ["sciatic", "坐骨"],
  ["sural", "腓肠"],
  ["ischiogluteal", "坐骨臀"],
  ["trochanteric", "转子"],
  ["malleolus", "踝"],
  ["tuberosity", "粗隆"],
  ["pubic", "耻骨"],
  ["collateral", "侧副"],
  ["tarsal", "跗"],
  ["arcuate", "弓状"],
  ["digital", "趾"],
  ["great", "大"],
  ["small", "小"],
  ["side", "侧"],
  ["intercapitular", "头间"],
  ["tributary", "属支"],
  ["thigh", "大腿"],
  ["cutaneous nerve", "皮神经"],
  ["cutaneous branches", "皮支"],
  ["muscular branches", "肌支"],
  ["perforating branches", "穿通支"],
  ["communicating", "交通"],
  ["ascending branch", "升支"],
  ["descending branch", "降支"],
  ["anterior branch", "前支"],
  ["posterior branch", "后支"],
  ["superficial branch", "浅支"],
  ["deep branch", "深支"],
  ["lateral branch", "外侧支"],
  ["medial branch", "内侧支"],
  ["anterior horn", "前角"],
  ["posterior horn", "后角"],
  ["lateral meniscus", "外侧半月板"],
  ["medial meniscus", "内侧半月板"],
  ["hip bone acetabulum", "髋骨髋臼"],
  ["hip bone pubis", "髋骨耻骨部"],
  ["sesamoid bones", "籽骨"],
  ["metatarsal bones", "跖骨"],
  ["phalanges of foot", "足趾骨"],
  ["phalanx", "趾骨"],
  ["metatarsal bone", "跖骨"],
  ["lumbar vertebra", "腰椎"],
  ["thoracic vertebra", "胸椎"],
  ["femoral artery", "股动脉"],
  ["femoral vein", "股静脉"],
  ["femoral nerve", "股神经"],
  ["fibular artery", "腓动脉"],
  ["fibular vein", "腓静脉"],
  ["tibial nerve", "胫神经"],
  ["obturator nerve", "闭孔神经"],
  ["saphenous nerve", "隐神经"],
  ["sural nerve", "腓肠神经"],
  ["sural vein", "腓肠静脉"],
  ["sural artery", "腓肠动脉"],
  ["femur", "股骨"],
  ["fibula", "腓骨"],
  ["tibia", "胫骨"],
  ["talus", "距骨"],
  ["calcaneus", "跟骨"],
  ["navicular bone", "舟骨"],
  ["cuboid bone", "骰骨"],
  ["cuneiform bone", "楔骨"],
  ["intermediate cuneiform", "中间楔骨"],
  ["hip bone", "髋骨"],
  ["patella", "髌骨"],
  ["sacrum", "骶骨"],
  ["coccyx", "尾骨"],
  ["acetabulum", "髋臼"],
  ["pubis", "耻骨"],
  ["artery", "动脉"],
  ["arteries", "动脉"],
  ["vein", "静脉"],
  ["veins", "静脉"],
  ["nerve", "神经"],
  ["nerves", "神经"],
  ["ligament", "韧带"],
  ["ligaments", "韧带"],
  ["muscle", "肌"],
  ["muscles", "肌"],
  ["tendon", "腱"],
  ["tendons", "腱"],
  ["aponeurosis", "腱膜"],
  ["fascia", "筋膜"],
  ["retinaculum", "支持带"],
  ["cartilage", "软骨"],
  ["capsule", "囊"],
  ["capsules", "囊"],
  ["bursa", "滑囊"],
  ["bursae", "滑囊"],
  ["labrum", "盂唇"],
  ["meniscus", "半月板"],
  ["membrane", "膜"],
  ["bone", "骨"],
  ["disc", "盘"],
  ["fat pad", "脂肪垫"],
  ["arch", "弓"],
  ["canal", "管"],
  ["ring", "环"],
  ["triangle", "三角"],
  ["opening", "裂孔"],
  ["hiatus", "裂孔"],
  ["vessels", "血管"],
  ["symphysis", "联合"],
  ["plexus", "丛"],
  ["recess", "隐窝"],
  ["between", "之间"],
  ["sheath", "鞘"],
  ["apparatus", "装置"],
  ["network", "网"],
  ["joint", "关节"],
  ["knee", "膝"],
  ["leg", "小腿"],
  ["foot", "足"],
  ["toe", "趾"],
  ["toes", "趾"],
  ["phalanges", "趾骨"],
  ["interphalangeal", "趾间"],
  ["metatarsal", "跖骨"],
  ["calcaneal", "跟骨"],
  ["fibular", "腓"],
  ["tibial", "胫"],
  ["femoral", "股"],
  ["branches", "支"],
  ["branch", "支"],
  ["perforating", "穿通"],
  ["head", "头"],
  ["part", "部"],
  ["common", "共同"],
  ["proper", "固有"],
  ["accessory", "副"],
  ["recurrent", "返"],
  ["transverse", "横"],
  ["descending", "降"],
  ["horizontal", "水平"],
  ["vertical", "垂直"],
  ["palmar", "掌跖侧"],
  ["suprapatellar", "髌上"],
  ["oblique", "斜"],
  ["anterior", "前"],
  ["posterior", "后"],
  ["medial", "内侧"],
  ["lateral", "外侧"],
  ["superior", "上"],
  ["inferior", "下"],
  ["superficial", "浅"],
  ["subcutaneous", "皮下"],
  ["subfascial", "筋膜下"],
  ["subpopliteal", "腘下"],
  ["subtendinous", "腱下"],
  ["infrapatellar", "髌下"],
  ["prepatellar", "髌前"],
  ["deep", "深"],
  ["dorsal", "背侧"],
  ["plantar", "足底"],
  ["distal", "远端"],
  ["proximal", "近端"],
  ["middle", "中"],
  ["long", "长"],
  ["short", "短"],
  ["brevis", "短"],
  ["longus", "长"],
  ["magnus", "大"],
  ["minimus", "小"],
  ["maximus", "大"],
  ["medius", "中"],
  ["overlay", "覆盖层"],
].sort((a, b) => b[0].length - a[0].length);

const TOE_ORDINAL_TRANSLATIONS = {
  "1st": "第1",
  "1th": "第1",
  "2nd": "第2",
  "2th": "第2",
  "3rd": "第3",
  "3th": "第3",
  "4th": "第4",
  "5th": "第5",
  first: "第1",
  second: "第2",
  third: "第3",
  fourth: "第4",
  fifth: "第5",
};

const host = document.getElementById("canvasHost");
const tooltip = document.getElementById("tooltip");
const structureList = document.getElementById("structureList");
const layerBadge = document.getElementById("layerBadge");
const partTitle = document.getElementById("partTitle");
const partSummary = document.getElementById("partSummary");
const partRole = document.getElementById("partRole");
const partLocation = document.getElementById("partLocation");
const partNotes = document.getElementById("partNotes");
const toggleExtractButton = document.getElementById("toggleExtractButton");
const hidePartButton = document.getElementById("hidePartButton");
const restoreHiddenButton = document.getElementById("restoreHiddenButton");
const panModeButton = document.getElementById("panModeButton");
const xrayModeButton = document.getElementById("xrayModeButton");

let scene;
let camera;
let renderer;
let controls;
let modelRoot;
let raycaster;
let pointer;
let selectedPart = null;
let hoveredPart = null;
let modelCenter = new THREE.Vector3();
let modelRadius = 1;
let isExploded = false;
let explosionReturnView = null;
let selectionOutline = null;
let selectedPartExtracted = false;
let isPanMode = false;
let isXrayMode = false;
let extractionReturnView = null;
let rotationPivotGesture = null;
let rendering;
let renderDirty = true;
let pointerStart = null;
let currentRegion = "foot";
let footBox = new THREE.Box3();
let wholeBox = new THREE.Box3();
let searchQuery = "";
let toastTimer;
const renderSettings = {
  exposure: 1,
  environmentStrength: 1,
  occlusion: true,
  xray: false,
};

const partRecords = new Map();
const pickables = [];
const activeTweens = new Set();
const activeLayers = new Set(LAYER_KEYS);
const hiddenParts = new Set();
const collapsedStructureGroups = new Set(LAYER_KEYS);

init();

async function init() {
  refreshIcons();
  try {
    setupScene();
    setupUi();
    bindEvents();
    animate();
    await loadRealModel();
    document.getElementById("loadState").hidden = true;
    document.getElementById("modelStatus").textContent = "解剖模型已就绪";
  } catch (error) {
    console.error(error);
    document.getElementById("loadTitle").textContent = "模型加载失败";
    document.getElementById("loadProgress").textContent =
      "请检查网络连接后重试";
    document.getElementById("modelStatus").textContent = "加载失败";
    const retry = document.getElementById("retryLoadButton");
    retry.hidden = false;
    retry.onclick = () => location.reload();
  }
}

function setupScene() {
  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(
    36,
    host.clientWidth / host.clientHeight,
    0.01,
    1000,
  );
  camera.position.set(0.9, 0.15, 2.5);

  rendering = createRendering(scene, camera, host);
  renderer = rendering.renderer;

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.rotateSpeed = 0.55;
  controls.panSpeed = 0.8;
  controls.zoomSpeed = 2.4;
  controls.zoomToCursor = true;
  controls.screenSpacePanning = true;
  setPanMode(false);

  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2();

  new ResizeObserver(onResize).observe(host);
}

function setupUi() {
  const layerSwitch = document.querySelector(".layer-switch");
  layerSwitch.innerHTML = Object.entries(LAYER_CONFIG)
    .map(
      ([layer, config]) => `
    <button class="layer-button is-active" type="button" data-layer="${layer}" aria-label="${config.label}" aria-pressed="true" style="--layer-color:${config.color}">
      <span class="layer-check"><i data-lucide="check"></i></span>${config.label}
    </button>
  `,
    )
    .join("");

  updateEmptyInfo();
  refreshIcons();
  syncPanelButtons();
}

async function loadRealModel() {
  const loader = new GLTFLoader();
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath(
    "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/",
  );
  loader.setDRACOLoader(dracoLoader);
  const gltf = await loader.loadAsync(MODEL_URL, (event) => {
    document.getElementById("loadProgress").textContent = event.total
      ? `模型载入 ${Math.round((event.loaded / event.total) * 100)}%`
      : "正在读取组织纹理";
  });
  modelRoot = gltf.scene;
  modelRoot.name = "Open3DModel lower limb";
  scene.add(modelRoot);

  normalizeModel(modelRoot);
  registerModelParts(modelRoot, gltf.parser);
  wholeBox.setFromObject(modelRoot, true);
  for (const record of partRecords.values()) {
    if (
      record.layer === "bone" &&
      /calcaneus|talus|cuneiform|cuboid|navicular|metatarsal|phalanx|sesamoid/i.test(
        record.name,
      )
    ) {
      footBox.union(new THREE.Box3().setFromObject(record.object, true));
    }
  }
  if (footBox.isEmpty()) footBox.copy(wholeBox);
  footBox.expandByScalar(0.03);
  camera.near = 0.005;
  camera.far = 50;
  controls.minDistance = 0.08;
  controls.maxDistance = 20;
  buildStructureList();
  applyVisibility();
  focusCamera(true);
  clearSelection();
  rendering.setSettings(renderSettings);
  renderDirty = true;
  dracoLoader.dispose();
}

function normalizeModel(root) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const scale = 4.2 / Math.max(size.x, size.y, size.z);
  root.scale.setScalar(scale);
  root.rotation.set(0, 0, 0);
  root.position.copy(center).multiplyScalar(-scale).applyEuler(root.rotation);
  root.updateMatrixWorld(true);

  const normalizedBox = new THREE.Box3().setFromObject(root);
  modelCenter = normalizedBox.getCenter(new THREE.Vector3());
  modelRadius = normalizedBox.getSize(new THREE.Vector3()).length() * 0.5;
  controls.target.copy(modelCenter);
}

function registerModelParts(root, parser) {
  const topGroups = new Map();
  root.children.forEach((child) =>
    topGroups.set(child.name.toLowerCase(), child.name),
  );

  root.traverse((object) => {
    if (!object.isMesh) return;

    const topGroup = findTopGroup(object, topGroups);
    // Overlays mark teaching regions, not anatomical tissue.
    if (topGroup.toLowerCase() === "overlays") {
      object.visible = false;
      return;
    }
    const layer = GROUP_TO_LAYER[topGroup.toLowerCase()];
    if (!layer) {
      object.visible = false;
      return;
    }
    const association =
      parser.associations.get(object) || parser.associations.get(object.parent);
    const sourceName = parser.json.nodes[association?.nodes]?.name;
    const name = cleanName(sourceName || object.userData.name || object.name);
    const chineseName = translateAnatomyName(name, layer);
    const record = {
      id: object.uuid,
      name,
      chineseName,
      layer,
      layerName: LAYER_CONFIG[layer]?.label || "结构",
      object,
      originalPosition: object.position.clone(),
      allExplode: new THREE.Vector3(),
      selectedExplode: new THREE.Vector3(),
    };

    const worldCenter = new THREE.Box3()
      .setFromObject(object)
      .getCenter(new THREE.Vector3());
    const direction = worldCenter.sub(modelCenter);
    if (direction.lengthSq() < 0.0001) direction.set(0, 1, 0);
    direction.normalize();
    const layerLift =
      layer === "artery" || layer === "vein" || layer === "nerve" ? 0.42 : 0.28;
    const inverseParent = object.parent.matrixWorld.clone().invert();
    const origin = new THREE.Vector3().applyMatrix4(inverseParent);
    record.selectedExplode
      .copy(direction)
      .multiplyScalar((0.56 + layerLift) * 1.8)
      .applyMatrix4(inverseParent)
      .sub(origin);
    record.allExplode
      .copy(direction)
      .multiplyScalar((0.28 + layerLift * 0.35) * 1.8)
      .applyMatrix4(inverseParent)
      .sub(origin);

    styleMesh(object, record);
    object.userData.partId = record.id;
    object.userData.layer = layer;
    partRecords.set(record.id, record);
    pickables.push(object);
  });
}

function findTopGroup(object, topGroups) {
  let current = object;
  let candidate = object.name;
  while (current.parent && current.parent !== modelRoot) {
    current = current.parent;
    candidate = current.name || candidate;
  }
  if (
    current.parent === modelRoot &&
    topGroups.has((current.name || "").toLowerCase())
  ) {
    return current.name;
  }
  return candidate;
}

function styleMesh(mesh, record) {
  mesh.material = tissueMaterial(mesh.material, record.layer, renderer);
}

function buildStructureList() {
  const records = Array.from(partRecords.values()).sort(
    (a, b) =>
      layerSort(a.layer) - layerSort(b.layer) ||
      a.chineseName.localeCompare(b.chineseName, "zh-CN"),
  );

  const groupedRecords = records.reduce((groups, record) => {
    if (!groups.has(record.layer)) groups.set(record.layer, []);
    groups.get(record.layer).push(record);
    return groups;
  }, new Map());

  structureList.innerHTML = Object.keys(LAYER_CONFIG)
    .filter((layer) => layer !== "all" && groupedRecords.has(layer))
    .map((layer) => {
      const groupRecords = groupedRecords.get(layer);
      const config = LAYER_CONFIG[layer];
      const collapsed = collapsedStructureGroups.has(layer);
      return `
        <section class="structure-group${collapsed ? " is-collapsed" : ""}" data-layer="${layer}" style="--group:${config.color}">
          <button class="structure-group-toggle" type="button" data-layer="${layer}" aria-expanded="${String(!collapsed)}">
            <span class="structure-group-title">
              <i data-lucide="chevron-down" class="structure-chevron" aria-hidden="true"></i>
              <span>${config.label}</span>
            </span>
            <span class="structure-group-meta">
              <span class="structure-hidden-count"></span>
              <span>${groupRecords.length}</span>
            </span>
          </button>
          <div class="structure-group-items">
            ${groupRecords
              .map(
                (record) => `
              <div class="structure-row" data-search="${escapeHtml((record.chineseName + " " + record.name).toLowerCase())}">
              <button class="structure-button" type="button" data-part="${record.id}" data-layer="${record.layer}">
                <span class="structure-name">
                  <span class="structure-name-cn">${escapeHtml(record.chineseName)}</span>
                  <span class="structure-name-en">${escapeHtml(record.name)}</span>
                </span>
              </button>
              <button class="icon-button part-visibility" type="button" data-visibility="${record.id}" title="隐藏${escapeHtml(record.chineseName)}" aria-label="隐藏${escapeHtml(record.chineseName)}"><i data-lucide="eye"></i></button>
              </div>
            `,
              )
              .join("")}
          </div>
        </section>
      `;
    })
    .join("");

  updateStructureGroupStates();
  document.getElementById("structureCount").textContent =
    `${records.length} 个部位`;
  refreshIcons();
}

function bindEvents() {
  window.addEventListener("resize", onResize);
  renderer.domElement.addEventListener("pointerdown", onPointerDown, {
    capture: true,
  });
  document.addEventListener("pointermove", onRotationPivotMove, {
    capture: true,
  });
  document.addEventListener("pointerup", clearRotationPivotGesture, {
    capture: true,
  });
  document.addEventListener("pointercancel", clearRotationPivotGesture, {
    capture: true,
  });
  renderer.domElement.addEventListener("pointermove", onPointerMove);
  renderer.domElement.addEventListener("pointerleave", () => setHover(null));
  renderer.domElement.addEventListener("click", (event) => {
    if (
      !pointerStart ||
      Math.hypot(
        event.clientX - pointerStart.x,
        event.clientY - pointerStart.y,
      ) > 5
    )
      return;
    const hit = pickVisiblePart(event);
    if (hit) selectPart(hit.object.userData.partId);
  });

  document.addEventListener("click", (event) => {
    const visibilityButton = event.target.closest("[data-visibility]");
    if (visibilityButton) {
      togglePartVisibility(visibilityButton.dataset.visibility);
      return;
    }
    const layerButton = event.target.closest(".layer-button");
    if (layerButton) {
      toggleLayer(layerButton.dataset.layer);
      return;
    }

    const structureGroupToggle = event.target.closest(
      ".structure-group-toggle",
    );
    if (structureGroupToggle) {
      toggleStructureGroup(structureGroupToggle.dataset.layer);
      return;
    }

    const structureButton = event.target.closest(".structure-button");
    if (structureButton) {
      selectPart(structureButton.dataset.part);
    }
  });

  document
    .getElementById("resetSelection")
    .addEventListener("click", clearSelection);
  toggleExtractButton.addEventListener("click", toggleSelectedExtraction);
  hidePartButton.addEventListener("click", hideSelectedPart);
  restoreHiddenButton.addEventListener("click", restoreHiddenParts);
  panModeButton.addEventListener("click", () => setPanMode(!isPanMode));
  document
    .getElementById("rotateModeButton")
    .addEventListener("click", () => setPanMode(false));
  xrayModeButton.addEventListener("click", () => setXrayMode(!isXrayMode));
  document
    .getElementById("focusButton")
    .addEventListener("click", () => focusCamera(false));
  document
    .getElementById("explodeAllButton")
    .addEventListener("click", explodeAll);
  document
    .getElementById("collapseButton")
    .addEventListener("click", collapseAll);
  renderer.domElement.addEventListener("contextmenu", (event) =>
    event.preventDefault(),
  );
  bindWorkbenchEvents();
}

function refreshIcons() {
  window.lucide?.createIcons({ attrs: { "aria-hidden": "true" } });
}

function syncPanelButtons() {
  const shell = document.querySelector(".app-shell");
  const navOpen =
    window.innerWidth <= 700
      ? shell.classList.contains("nav-open")
      : !shell.classList.contains("nav-closed");
  const detailOpen =
    window.innerWidth <= 960
      ? shell.classList.contains("detail-open")
      : !shell.classList.contains("detail-closed");
  document
    .getElementById("navToggle")
    .setAttribute("aria-expanded", String(navOpen));
  document
    .getElementById("detailToggle")
    .setAttribute("aria-expanded", String(detailOpen));
}

function bindWorkbenchEvents() {
  const shell = document.querySelector(".app-shell");
  document.getElementById("navToggle").addEventListener("click", () => {
    shell.classList.toggle(
      window.innerWidth <= 700 ? "nav-open" : "nav-closed",
    );
    if (window.innerWidth <= 700)
      shell.classList.remove("detail-open", "nav-closed");
    syncPanelButtons();
  });
  document.getElementById("detailToggle").addEventListener("click", () => {
    shell.classList.toggle(
      window.innerWidth <= 960 ? "detail-open" : "detail-closed",
    );
    if (window.innerWidth <= 960)
      shell.classList.remove("nav-open", "detail-closed");
    syncPanelButtons();
  });
  document
    .getElementById("structureSearch")
    .addEventListener("input", (event) => {
      searchQuery = event.target.value.trim().toLowerCase();
      filterStructureList();
    });
  document.getElementById("foldGroupsButton").addEventListener("click", () => {
    const allCollapsed = collapsedStructureGroups.size === LAYER_KEYS.length;
    collapsedStructureGroups.clear();
    if (!allCollapsed)
      LAYER_KEYS.forEach((key) => collapsedStructureGroups.add(key));
    const button = document.getElementById("foldGroupsButton");
    button.title = allCollapsed ? "折叠所有分组" : "展开所有分组";
    button.setAttribute("aria-label", button.title);
    updateStructureGroupStates();
  });
  document.querySelectorAll("[data-region]").forEach((button) => {
    button.addEventListener("click", () => {
      if (selectedPartExtracted) clearSelection();
      currentRegion = button.dataset.region;
      document.querySelectorAll("[data-region]").forEach((item) => {
        item.classList.toggle("is-active", item === button);
        item.setAttribute("aria-pressed", String(item === button));
      });
      document.getElementById("regionCaption").textContent =
        currentRegion === "foot" ? "足与踝" : "右侧下肢";
      focusCamera(false);
    });
  });
  document
    .getElementById("viewPreset")
    .addEventListener("change", () => focusCamera(false));
  const settingsPanel = document.getElementById("renderSettings");
  const settingsButton = document.getElementById("renderSettingsButton");
  settingsButton.addEventListener("click", () => {
    settingsPanel.hidden = !settingsPanel.hidden;
    settingsButton.setAttribute("aria-expanded", String(!settingsPanel.hidden));
  });
  document.addEventListener("pointerdown", (event) => {
    if (
      !settingsPanel.contains(event.target) &&
      !settingsButton.contains(event.target)
    ) {
      settingsPanel.hidden = true;
      settingsButton.setAttribute("aria-expanded", "false");
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    settingsPanel.hidden = true;
    settingsButton.setAttribute("aria-expanded", "false");
    shell.classList.remove("nav-open", "detail-open");
    syncPanelButtons();
  });
  const updateRendering = () => {
    renderSettings.exposure = Number(
      document.getElementById("exposureControl").value,
    );
    renderSettings.environmentStrength = Number(
      document.getElementById("fillControl").value,
    );
    renderSettings.occlusion = document.getElementById("aoControl").checked;
    document.getElementById("exposureValue").value =
      renderSettings.exposure.toFixed(2);
    document.getElementById("fillValue").value =
      `${Math.round(renderSettings.environmentStrength * 100)}%`;
    rendering.setSettings(renderSettings);
    renderDirty = true;
  };
  ["exposureControl", "fillControl", "aoControl"].forEach((id) =>
    document.getElementById(id).addEventListener("input", updateRendering),
  );
  document.getElementById("resetRenderButton").addEventListener("click", () => {
    document.getElementById("exposureControl").value = "1";
    document.getElementById("fillControl").value = "1";
    document.getElementById("aoControl").checked = true;
    updateRendering();
  });
  document.getElementById("captureButton").addEventListener("click", () => {
    rendering.render();
    renderer.domElement.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "anatomy-atlas.png";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast("模型图片已导出");
    }, "image/png");
  });
}

function filterStructureList() {
  let matches = 0;
  document.querySelectorAll(".structure-group").forEach((group) => {
    let groupMatches = 0;
    group.querySelectorAll(".structure-row").forEach((row) => {
      row.hidden = !row.dataset.search.includes(searchQuery);
      if (!row.hidden) groupMatches += 1;
    });
    group.hidden = groupMatches === 0;
    matches += groupMatches;
  });
  document.getElementById("searchEmpty").hidden = matches > 0;
  document.getElementById("structureCount").textContent = `${matches} 个部位`;
  updateStructureGroupStates();
}

function togglePartVisibility(partId) {
  if (hiddenParts.has(partId)) {
    hiddenParts.delete(partId);
  } else if (selectedPart === partId) {
    hideSelectedPart();
    return;
  } else {
    hiddenParts.add(partId);
  }
  setHover(null);
  applyVisibility();
  updateButtons();
}

function updateVisibilityButtons() {
  document.querySelectorAll("[data-visibility]").forEach((button) => {
    const hidden = hiddenParts.has(button.dataset.visibility);
    const record = partRecords.get(button.dataset.visibility);
    button.classList.toggle("is-hidden", hidden);
    button.title = `${hidden ? "显示" : "隐藏"}${record.chineseName}`;
    button.setAttribute("aria-label", button.title);
    const name = hidden ? "eye-off" : "eye";
    if (button.dataset.icon !== name) {
      button.innerHTML = `<i data-lucide="${name}"></i>`;
      button.dataset.icon = name;
    }
  });
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, 2400);
}

function onPointerDown(event) {
  pointerStart = { x: event.clientX, y: event.clientY };
  if (!modelRoot) return;
  if (!shouldSetRotationPivot(event)) return;

  const hit = pickVisiblePart(event);
  rotationPivotGesture = hit
    ? {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        point: hit.point.clone(),
        applied: false,
      }
    : null;
}

function onRotationPivotMove(event) {
  if (
    !rotationPivotGesture ||
    rotationPivotGesture.pointerId !== event.pointerId
  )
    return;
  if (rotationPivotGesture.applied) return;

  const dragDistance = Math.hypot(
    event.clientX - rotationPivotGesture.startX,
    event.clientY - rotationPivotGesture.startY,
  );
  if (dragDistance < 3) return;

  applyRotationPivot(rotationPivotGesture.point);
  rotationPivotGesture.applied = true;
}

function applyRotationPivot(point) {
  cancelTweensFor(camera.position);
  cancelTweensFor(controls.target);
  controls.target.copy(point);
  controls.update();
}

function clearRotationPivotGesture(event) {
  if (!rotationPivotGesture) return;
  if (
    event?.pointerId !== undefined &&
    rotationPivotGesture.pointerId !== event.pointerId
  )
    return;
  rotationPivotGesture = null;
}

function shouldSetRotationPivot(event) {
  if (event.pointerType === "touch") return event.isPrimary && !isPanMode;
  if (event.button === 0) return !isPanMode;
  if (event.button === 2) return isPanMode;
  return false;
}

function onPointerMove(event) {
  if (!modelRoot) return;
  const hit = pickVisiblePart(event);
  if (!hit) {
    setHover(null);
    return;
  }
  setHover(hit.object.userData.partId, event.clientX, event.clientY);
}

function pickVisiblePart(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  return raycaster
    .intersectObjects(
      pickables.filter((object) => object.visible),
      false,
    )
    .find((item) => {
      const record = partRecords.get(item.object.userData.partId);
      return record && isPartVisible(record);
    });
}

function setHover(partId, x = 0, y = 0) {
  const changed = hoveredPart !== partId;
  hoveredPart = partId;
  document.body.style.cursor = partId
    ? "pointer"
    : isPanMode
      ? "grab"
      : "default";
  if (!partId) {
    tooltip.classList.remove("is-visible");
    if (changed) updateHighlights();
    return;
  }
  const record = partRecords.get(partId);
  tooltip.textContent = record ? getDisplayName(record) : "";
  tooltip.style.left = `${Math.min(x, window.innerWidth - 270)}px`;
  tooltip.style.top = `${Math.min(y, window.innerHeight - 90)}px`;
  tooltip.classList.add("is-visible");
  if (changed) updateHighlights();
}

function setPanMode(enabled) {
  isPanMode = enabled;
  controls.enablePan = true;
  controls.mouseButtons = {
    LEFT: enabled ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: enabled ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN,
  };
  controls.touches = {
    ONE: enabled ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE,
    TWO: THREE.TOUCH.DOLLY_PAN,
  };
  if (panModeButton) {
    panModeButton.classList.toggle("is-active", enabled);
    panModeButton.setAttribute("aria-pressed", String(enabled));
    document
      .getElementById("rotateModeButton")
      .classList.toggle("is-active", !enabled);
    document
      .getElementById("rotateModeButton")
      .setAttribute("aria-pressed", String(!enabled));
  }
  document.body.style.cursor = enabled ? "grab" : "default";
}

function setXrayMode(enabled) {
  isXrayMode = enabled;
  xrayModeButton.classList.toggle("is-active", enabled);
  xrayModeButton.setAttribute("aria-pressed", String(enabled));
  xrayModeButton.title = enabled ? "关闭透视观察" : "开启透视观察";
  renderSettings.xray = enabled;
  rendering.setSettings(renderSettings);
  applyVisibility();
}

function selectPart(partId) {
  const record = partRecords.get(partId);
  if (!record) return;
  const previousPart = selectedPart;
  const previousPartExtracted = selectedPartExtracted;

  if (previousPartExtracted && previousPart && previousPart !== partId) {
    const previousRecord = partRecords.get(previousPart);
    if (previousRecord) {
      tweenVector(
        previousRecord.object.position,
        getBasePosition(previousRecord),
        520,
      );
    }
    selectedPartExtracted = false;
    restoreExtractionView();
    extractionReturnView = null;
  }

  hiddenParts.delete(partId);
  selectedPart = partId;
  if (previousPart !== partId) {
    selectedPartExtracted = false;
    extractionReturnView = null;
  }

  if (!isLayerAvailable(record.layer)) {
    activeLayers.add(record.layer);
    updateLayerButtons();
  }

  setSelectionOutline(record);

  partRecords.forEach((item) => {
    item.object.visible = isPartVisible(item);
    applyRecordOpacity(item, 420);
  });

  updateInfo(record);
  updateButtons();
  applyVisibility();
  updateHighlights();
  if (window.innerWidth <= 960) {
    const shell = document.querySelector(".app-shell");
    shell.classList.remove("nav-open", "detail-closed");
    shell.classList.add("detail-open");
    syncPanelButtons();
  }
}

function clearSelection() {
  if (selectedPartExtracted && selectedPart) {
    const record = partRecords.get(selectedPart);
    if (record) {
      tweenVector(record.object.position, getBasePosition(record), 520);
    }
  }
  selectedPart = null;
  selectedPartExtracted = false;
  restoreExtractionView();
  extractionReturnView = null;
  removeSelectionOutline();
  partRecords.forEach((record) => {
    record.object.visible = isPartVisible(record);
    tweenVector(record.object.position, getBasePosition(record), 620);
    tweenMaterial(
      record.object.material,
      {
        opacity: displayOpacity(record),
        emissiveIntensity: 0,
      },
      360,
    );
    updateMaterialDepth(record, displayOpacity(record));
  });
  updateEmptyInfo();
  updateButtons();
}

function updateEmptyInfo() {
  partTitle.innerHTML = '足与踝<span class="part-title-en">Foot & ankle</span>';
  partSummary.textContent =
    "足踝由骨性支架、关节及周围软组织组成，肌腱、韧带与神经血管相互交织。";
  partRole.textContent = "承担负重、缓冲冲击，并在步行和跑跳时传递力量。";
  partLocation.textContent =
    "位于下肢远端，包含踝、后足、中足及前足，与小腿肌腱和神经血管相连。";
  layerBadge.textContent = "图谱概览";
  partNotes.innerHTML = `
    <li>右侧下肢，包含 9 类解剖组织。</li>
    <li>保留骨、肌肉与结缔组织的空间关系。</li>
    <li>当前资产不包含皮肤表层。</li>
  `;
}

function explodeAll() {
  if (isExploded) return;
  explosionReturnView = {
    ...(extractionReturnView || {
      cameraPosition: camera.position.clone(),
      controlsTarget: controls.target.clone(),
    }),
    region: currentRegion,
  };
  selectedPartExtracted = false;
  extractionReturnView = null;
  isExploded = true;
  applyStructurePositions(760);
  frameBox(
    getViewBox(),
    explosionReturnView.cameraPosition.clone().sub(explosionReturnView.controlsTarget),
    false,
  );
  applyVisibility();
  updateButtons();
  updateHighlights();
}

function collapseAll() {
  if (!isExploded) return;
  isExploded = false;
  selectedPartExtracted = false;
  extractionReturnView = null;
  applyStructurePositions(760);
  if (explosionReturnView?.region === currentRegion) {
    tweenVector(camera.position, explosionReturnView.cameraPosition, 680);
    tweenVector(controls.target, explosionReturnView.controlsTarget, 680);
  } else {
    focusCamera(false);
  }
  explosionReturnView = null;
  applyVisibility();
  updateButtons();
  updateHighlights();
}

function applyStructurePositions(duration) {
  partRecords.forEach((record) => {
    tweenVector(record.object.position, getTargetPosition(record), duration);
  });
}

function applyVisibility() {
  partRecords.forEach((record) => {
    const visible = isPartVisible(record);
    record.object.visible = visible;
    applyRecordOpacity(record, 220);
  });

  document.querySelectorAll(".structure-button").forEach((button) => {
    const hidden = hiddenParts.has(button.dataset.part);
    const visible = isLayerAvailable(button.dataset.layer) && !hidden;
    button.classList.toggle("is-hidden", hidden);
    button.style.opacity = hidden ? "0.34" : visible ? "1" : "0.38";
    button.title = hidden ? "该部位已隐藏，点击可恢复并选中" : "";
  });
  updateStructureGroupStates();
  document.getElementById("visibleCount").textContent =
    `${Array.from(partRecords.values()).filter(isPartVisible).length} / ${partRecords.size} 个部位可见`;
  renderDirty = true;
}

function toggleStructureGroup(layer) {
  if (!layer) return;
  if (collapsedStructureGroups.has(layer)) {
    collapsedStructureGroups.delete(layer);
  } else {
    collapsedStructureGroups.add(layer);
  }
  updateStructureGroupStates();
}

function updateStructureGroupStates() {
  document.querySelectorAll(".structure-group").forEach((group) => {
    const layer = group.dataset.layer;
    const collapsed = collapsedStructureGroups.has(layer) && !searchQuery;
    const layerAvailable = isLayerAvailable(layer);
    const buttons = Array.from(group.querySelectorAll(".structure-button"));
    const hiddenCount = buttons.filter((button) =>
      hiddenParts.has(button.dataset.part),
    ).length;
    const hiddenCountNode = group.querySelector(".structure-hidden-count");

    group.classList.toggle("is-collapsed", collapsed);
    group.classList.toggle("is-layer-hidden", !layerAvailable);
    group
      .querySelector(".structure-group-toggle")
      ?.setAttribute("aria-expanded", String(!collapsed));
    if (hiddenCountNode) {
      hiddenCountNode.textContent = hiddenCount ? `隐藏 ${hiddenCount}` : "";
    }
  });
}

function toggleLayer(layer) {
  if (!LAYER_CONFIG[layer]) return;

  if (activeLayers.has(layer)) {
    activeLayers.delete(layer);
  } else {
    activeLayers.add(layer);
  }

  updateLayerButtons();
  const selectedRecord = selectedPart ? partRecords.get(selectedPart) : null;
  if (selectedRecord && !isLayerAvailable(selectedRecord.layer)) {
    clearSelection();
  }
  applyVisibility();
  updateHighlights();
}

function updateLayerButtons() {
  document.getElementById("layerCount").textContent =
    `${activeLayers.size} / ${LAYER_KEYS.length}`;
  document.querySelectorAll(".layer-button").forEach((button) => {
    const layer = button.dataset.layer;
    const active = activeLayers.has(layer);
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
    button.title = active ? "点击隐藏该类结构" : "点击显示该类结构";
  });
}

function updateInfo(record) {
  const info = getDetail(record);
  partTitle.innerHTML = `
    <span class="part-title-cn">${escapeHtml(record.chineseName)}</span>
    <span class="part-title-en">${escapeHtml(record.name)}</span>
  `;
  partSummary.textContent = info.summary;
  partRole.textContent = info.role;
  partLocation.textContent = info.location;
  layerBadge.textContent = info.badge;
  partNotes.innerHTML = info.notes
    .map((note) => `<li>${escapeHtml(note)}</li>`)
    .join("");
}

function getDetail(record) {
  const override = findDetailOverride(record);
  const badge = override?.badge || anatomyBadge(record);
  return {
    badge,
    summary:
      override?.summary || `${record.chineseName}，属于右下肢的${badge}结构。`,
    role: override?.role || layerRole(record.layer),
    location:
      override?.location || "右侧下肢。具体附着点及毗邻关系尚未单独标注。",
    notes: [
      `类别：${badge}`,
      `中文译名：${record.chineseName}`,
      `英文原名：${record.name}`,
      "所属侧别：右侧下肢",
    ],
  };
}

function findDetailOverride(record) {
  return DETAIL_OVERRIDES.find((item) => {
    const layerMatches = !item.layers || item.layers.includes(record.layer);
    return layerMatches && item.match.test(record.name);
  });
}

function anatomyBadge(record) {
  if (/tendon/i.test(record.name)) return "肌腱";
  if (/aponeurosis|fascia/i.test(record.name)) return "筋膜";
  if (/retinaculum/i.test(record.name)) return "支持带";
  if (/meniscus/i.test(record.name)) return "半月板";
  if (/labrum/i.test(record.name)) return "关节唇";
  if (/art cart|cartilage/i.test(record.name)) return "软骨";
  return record.layerName;
}

function updateButtons() {
  document.querySelectorAll(".structure-button").forEach((button) => {
    button.classList.toggle(
      "is-selected",
      button.dataset.part === selectedPart,
    );
    button.classList.toggle("is-hidden", hiddenParts.has(button.dataset.part));
  });
  toggleExtractButton.disabled = !selectedPart;
  toggleExtractButton.innerHTML = `<i data-lucide="${selectedPartExtracted ? "undo-2" : "move-up-right"}"></i><span>${selectedPartExtracted ? "回位" : "抽出部位"}</span>`;
  toggleExtractButton.classList.toggle("is-active", selectedPartExtracted);
  hidePartButton.disabled = !selectedPart;
  restoreHiddenButton.disabled = hiddenParts.size === 0;
  document.getElementById("hiddenCount").textContent =
    `${hiddenParts.size} 个隐藏`;
  document.getElementById("selectionState").textContent = selectedPart
    ? selectedPartExtracted
      ? "已抽出"
      : "原位选中"
    : "未选择";
  document
    .getElementById("explodeAllButton")
    .classList.toggle("is-active", isExploded);
  updateVisibilityButtons();
  refreshIcons();
}

function toggleSelectedExtraction() {
  if (!selectedPart) return;
  const record = partRecords.get(selectedPart);
  if (!record) return;

  if (selectedPartExtracted) {
    selectedPartExtracted = false;
    tweenVector(record.object.position, getBasePosition(record), 680);
    restoreExtractionView();
  } else {
    selectedPartExtracted = true;
    extractionReturnView = {
      cameraPosition: camera.position.clone(),
      controlsTarget: controls.target.clone(),
    };
    const extractedPosition = record.originalPosition
      .clone()
      .add(record.selectedExplode);
    tweenVector(record.object.position, extractedPosition, 680);
    focusExtractedPart(record, extractedPosition);
  }

  updateButtons();
}

function getTargetPosition(record) {
  if (selectedPartExtracted && record.id === selectedPart) {
    return record.originalPosition.clone().add(record.selectedExplode);
  }
  return getBasePosition(record);
}

function getBasePosition(record) {
  return isExploded
    ? record.originalPosition.clone().add(record.allExplode)
    : record.originalPosition.clone();
}

function hideSelectedPart() {
  if (!selectedPart) return;
  const record = partRecords.get(selectedPart);
  if (!record) return;

  hiddenParts.add(record.id);
  if (selectedPartExtracted) {
    restoreExtractionView();
  }

  tweenVector(record.object.position, getBasePosition(record), 320);
  selectedPart = null;
  selectedPartExtracted = false;
  extractionReturnView = null;
  setHover(null);
  removeSelectionOutline();
  updateEmptyInfo();
  applyVisibility();
  updateButtons();
  updateHighlights();
}

function restoreHiddenParts() {
  if (!hiddenParts.size) return;
  hiddenParts.clear();
  applyVisibility();
  updateButtons();
  updateHighlights();
}

function focusExtractedPart(record, extractedPosition) {
  const box = getRecordBoxAtPosition(record, extractedPosition);
  const viewDirection = camera.position.clone().sub(controls.target);
  frameBox(box, viewDirection, false);
}

function restoreExtractionView() {
  if (!extractionReturnView) return;
  tweenVector(camera.position, extractionReturnView.cameraPosition, 680);
  tweenVector(controls.target, extractionReturnView.controlsTarget, 680);
  extractionReturnView = null;
}

function getRecordBoxAtPosition(record, position) {
  const originalPosition = record.object.position.clone();
  record.object.position.copy(position);
  record.object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(record.object);
  record.object.position.copy(originalPosition);
  record.object.updateMatrixWorld(true);
  return box;
}

function updateHighlights() {
  renderDirty = true;
  partRecords.forEach((record) => {
    const isSelected = record.id === selectedPart;
    const isHovered = record.id === hoveredPart;
    const highlighted =
      (isSelected || isHovered) && isLayerAvailable(record.layer);
    record.object.material.emissive.setHex(
      isSelected ? SELECTED_EMISSIVE : isHovered ? HOVER_EMISSIVE : 0x000000,
    );
    tweenMaterial(
      record.object.material,
      {
        emissiveIntensity: highlighted
          ? isSelected
            ? SELECTED_EMISSIVE_INTENSITY
            : HOVER_EMISSIVE_INTENSITY
          : 0,
      },
      180,
    );
  });
}

function setSelectionOutline(record) {
  removeSelectionOutline();
  const highlightGroup = new THREE.Group();
  highlightGroup.name = "selected anatomy highlight";
  highlightGroup.userData.partId = record.id;
  highlightGroup.matrixAutoUpdate = false;

  const outlineMaterial = new THREE.MeshBasicMaterial({
    color: OUTLINE_COLOR,
    transparent: true,
    opacity: 0.36,
    side: THREE.BackSide,
    depthWrite: false,
  });

  const outline = createCenteredHighlightMesh(
    record.object.geometry,
    outlineMaterial,
    selectionOutlineScale(record.layer),
  );

  highlightGroup.add(outline);
  scene.add(highlightGroup);
  selectionOutline = highlightGroup;
  syncSelectionOutline();
}

function removeSelectionOutline() {
  if (!selectionOutline) return;
  const outline = selectionOutline;
  selectionOutline = null;
  outline.parent?.remove(outline);
  outline.traverse((object) => {
    if (object.material) object.material.dispose();
  });
}

function createCenteredHighlightMesh(geometry, material, scale) {
  geometry.computeBoundingBox();
  const center =
    geometry.boundingBox?.getCenter(new THREE.Vector3()) || new THREE.Vector3();
  const pivot = new THREE.Group();
  pivot.name = "selected anatomy centered outline";
  pivot.position.copy(center);
  pivot.scale.setScalar(scale);

  const shell = new THREE.Mesh(geometry, material);
  shell.name = "selected anatomy outline shell";
  shell.position.copy(center).multiplyScalar(-1);
  shell.renderOrder = 30;
  shell.raycast = () => {};
  pivot.add(shell);

  return pivot;
}

function syncSelectionOutline() {
  if (!selectionOutline) return;
  const record = partRecords.get(selectionOutline.userData.partId);
  if (!record || record.id !== selectedPart || !isPartVisible(record)) {
    selectionOutline.visible = false;
    return;
  }

  record.object.updateMatrixWorld(true);
  selectionOutline.visible = record.object.visible;
  selectionOutline.matrix.copy(record.object.matrixWorld);
  selectionOutline.matrixWorldNeedsUpdate = true;
}

function selectionOutlineScale(layer) {
  if (layer === "artery" || layer === "vein" || layer === "nerve") return 1.018;
  if (layer === "muscle" || layer === "ligament") return 1.01;
  return 1.006;
}

function getViewBox() {
  const regionBox = currentRegion === "foot" ? footBox : wholeBox;
  if (!isExploded) return regionBox;
  const expandedBox = new THREE.Box3();
  partRecords.forEach((record) => {
    if (!isPartVisible(record)) return;
    // Clip before translation so a calf-spanning mesh does not reframe the whole leg.
    const box = getRecordBoxAtPosition(record, record.originalPosition).intersect(regionBox);
    if (box.isEmpty()) return;
    const parentMatrix = record.object.parent.matrixWorld;
    const origin = record.originalPosition.clone().applyMatrix4(parentMatrix);
    const offset = getTargetPosition(record).applyMatrix4(parentMatrix).sub(origin);
    expandedBox.union(box.translate(offset));
  });
  return expandedBox.isEmpty() ? regionBox : expandedBox;
}

function focusCamera(immediate) {
  if (!modelRoot) return;
  const preset = document.getElementById("viewPreset").value;
  const directions = {
    perspective: [1.3, 0.85, 1],
    front: [0, 0, 1],
    back: [0, 0, -1],
    medial: [1, 0, 0],
    lateral: [-1, 0, 0],
    plantar: [0, -1, 0.01],
  };
  frameBox(
    getViewBox(),
    new THREE.Vector3(...directions[preset]),
    immediate,
  );
  document.getElementById("viewCaption").textContent =
    `右侧 · ${document.getElementById("viewPreset").selectedOptions[0].textContent}`;
}

function frameBox(box, direction, immediate) {
  if (box.isEmpty()) return;
  const center = box.getCenter(new THREE.Vector3());
  direction.normalize();
  const rotation = new THREE.Matrix4().lookAt(
    direction,
    new THREE.Vector3(),
    camera.up,
  );
  const right = new THREE.Vector3().setFromMatrixColumn(rotation, 0);
  const up = new THREE.Vector3().setFromMatrixColumn(rotation, 1);
  const tangent = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  let distance = 0.2;
  // Fit every corner to the actual canvas, including portrait and collapsed panels.
  for (const x of [box.min.x, box.max.x])
    for (const y of [box.min.y, box.max.y])
      for (const z of [box.min.z, box.max.z]) {
        const offset = new THREE.Vector3(x, y, z).sub(center);
        distance = Math.max(
          distance,
          Math.abs(offset.dot(up)) / tangent + offset.dot(direction),
          Math.abs(offset.dot(right)) / (tangent * camera.aspect) +
            offset.dot(direction),
        );
      }
  const position = center.clone().addScaledVector(direction, distance * 1.08);
  if (immediate) {
    cancelTweensFor(camera.position);
    cancelTweensFor(controls.target);
    camera.position.copy(position);
    controls.target.copy(center);
    controls.update();
  } else {
    tweenVector(camera.position, position, 680);
    tweenVector(controls.target, center, 680);
  }
  camera.updateProjectionMatrix();
  renderDirty = true;
}

function onResize() {
  if (!renderer || !camera) return;
  const width = host.clientWidth;
  const height = host.clientHeight;
  if (!width || !height) return;
  const previousAspect = camera.aspect;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  rendering.resize(width, height);
  if (modelRoot && previousAspect !== camera.aspect) {
    camera.position
      .sub(controls.target)
      .multiplyScalar(
        Math.max(1, 1 / camera.aspect) / Math.max(1, 1 / previousAspect),
      )
      .add(controls.target);
  }
  syncPanelButtons();
  renderDirty = true;
}

function animate() {
  requestAnimationFrame(animate);
  const wasAnimating = activeTweens.size > 0;
  runTweens();
  syncSelectionOutline();
  const moved = controls.update();
  if (renderDirty || wasAnimating || moved) {
    rendering.render();
    renderDirty = false;
  }
}

function tweenVector(vector, target, duration) {
  cancelTweensFor(vector);
  activeTweens.add({
    type: "vector",
    target: vector,
    from: vector.clone(),
    to: target.clone(),
    start: performance.now(),
    duration,
  });
}

function tweenMaterial(material, values, duration) {
  Object.entries(values).forEach(([key, value]) => {
    activeTweens.forEach((tween) => {
      if (tween.target === material && tween.key === key)
        activeTweens.delete(tween);
    });
    if (material[key] === value) return;
    activeTweens.add({
      type: "material",
      target: material,
      key,
      from: material[key],
      to: value,
      start: performance.now(),
      duration,
    });
  });
}

function cancelTweensFor(target) {
  activeTweens.forEach((tween) => {
    if (tween.target === target) activeTweens.delete(tween);
  });
}

function runTweens() {
  const now = performance.now();
  activeTweens.forEach((tween) => {
    const progress = Math.min(1, (now - tween.start) / tween.duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    if (tween.type === "vector") {
      tween.target.copy(tween.from).lerp(tween.to, eased);
    } else {
      tween.target[tween.key] = tween.from + (tween.to - tween.from) * eased;
    }
    if (progress >= 1) activeTweens.delete(tween);
  });
}

function layerOpacity(layer) {
  if (!isLayerAvailable(layer)) return 0;
  return 1;
}

function recordOpacity(record) {
  if (!isPartVisible(record)) return 0;
  return layerOpacity(record.layer);
}

function displayOpacity(record) {
  const baseOpacity = recordOpacity(record);
  if (!isXrayMode || !baseOpacity) return baseOpacity;
  if (selectedPart) {
    return record.id === selectedPart
      ? baseOpacity
      : Math.min(baseOpacity, XRAY_OPACITY);
  }
  return Math.min(baseOpacity, GLOBAL_XRAY_OPACITY);
}

function applyRecordOpacity(record, duration) {
  const targetOpacity = displayOpacity(record);
  updateMaterialDepth(record, targetOpacity);
  tweenMaterial(record.object.material, { opacity: targetOpacity }, duration);
}

function updateMaterialDepth(record, opacity) {
  const material = record.object.material;
  const transparent = opacity < 1;
  if (material.transparent !== transparent) {
    material.transparent = transparent;
    material.needsUpdate = true;
  }
  material.depthWrite = !transparent;
}

function isPartVisible(record) {
  return isLayerAvailable(record.layer) && !hiddenParts.has(record.id);
}

function isLayerAvailable(layer) {
  return activeLayers.has(layer);
}

function layerSort(layer) {
  return Object.keys(LAYER_CONFIG).indexOf(layer);
}

function getDisplayName(record) {
  if (!record) return "";
  return record.chineseName && record.chineseName !== record.name
    ? `${record.chineseName}\n${record.name}`
    : record.name;
}

function translateAnatomyName(name, layer) {
  const cleaned = cleanName(name);
  if (!cleaned) return `${LAYER_CONFIG[layer]?.label || "解剖"}结构`;
  const cleanedExact = getExactTranslation(cleaned);
  if (cleanedExact) return cleanedExact;

  const text = normalizeTranslationSource(cleaned);
  const exact = getExactTranslation(text);
  if (exact) return exact;

  const translated = translateSpecialPattern(text) || translatePhrase(text);
  if (containsChinese(translated)) return translated;
  return `${LAYER_CONFIG[layer]?.label || "解剖"}结构`;
}

function normalizeTranslationSource(value) {
  return value
    .replace(/\bbr\.?\s*of\b/gi, "branch of")
    .replace(/\bbr\./gi, "branch")
    .replace(/\bbr\b/gi, "branch")
    .replace(/\ba\./gi, "artery")
    .replace(/\ba\b/gi, "artery")
    .replace(/\blig\./gi, "ligament")
    .replace(/\bpost\b/gi, "posterior")
    .replace(/\bthe\b/gi, "")
    .replace(/\bSural n\b/gi, "Sural nerve")
    .replace(/\bFemoralis nerve\b/gi, "Femoral nerve")
    .replace(/\bplanter\b/gi, "plantar")
    .replace(/\bcuteneous\b/gi, "cutaneous")
    .replace(/\bcollatertal\b/gi, "collateral")
    .replace(/\s+/g, " ")
    .trim();
}

function translateSpecialPattern(value) {
  let match = value.match(
    /^(\d(?:st|nd|rd|th)) Dorsal interossei muscles of foot$/i,
  );
  if (match) return `${translateOrdinal(match[1])}足背骨间肌`;

  match = value.match(
    /^(\d(?:st|nd|rd|th)) to (\d(?:st|nd|rd|th)) perforating branches of the deep femoral (artery|vein)$/i,
  );
  if (match)
    return `${translateOrdinal(match[1])}至${translateOrdinal(match[2])}穿通支（${match[3].toLowerCase() === "artery" ? "股深动脉" : "股深静脉"}）`;

  match = value.match(
    /^Annular ligaments of (\d(?:st|nd|rd|th)) toe (A\d-A\d)$/i,
  );
  if (match) return `${translateOrdinal(match[1])}趾环状韧带 ${match[2]}`;

  match = value.match(
    /^Cruciform ligaments (?:or|of) (\d(?:st|nd|rd|th)) toe$/i,
  );
  if (match) return `${translateOrdinal(match[1])}趾十字韧带`;

  match = value.match(/^Extensor apparatus of (\d(?:st|nd|rd|th)) toe$/i);
  if (match) return `${translateOrdinal(match[1])}趾伸肌装置`;

  match = value.match(/^Annulus fibrosus ([A-Z0-9]+) ([A-Z0-9]+)$/i);
  if (match) return `${match[1]}-${match[2]}纤维环`;

  match = value.match(/^Lumbar vertebra \((L\d)\)$/i);
  if (match) return `腰椎（${match[1]}）`;

  match = value.match(/^Thoracic vertebra \((T\d+)\)$/i);
  if (match) return `胸椎（${match[1]}）`;

  match = value.match(/^(First|Second|Third|Fourth|Fifth) metatarsal bone$/i);
  if (match) return `${translateOrdinal(match[1])}跖骨`;

  match = value.match(
    /^(Distal|Middle|Proximal) phalanx of (first|second|third|fourth|fifth) finger of foot$/i,
  );
  if (match)
    return `足${translateOrdinal(match[2])}趾${translatePosition(match[1])}趾骨`;

  match = value.match(/^Art carts? of (.+)$/i);
  if (match) return `${translatePhrase(match[1])}关节软骨`;

  match = value.match(/^Articular cartilage of (.+)$/i);
  if (match) return `${translatePhrase(match[1])}关节软骨`;

  match = value.match(/^Articular capsules? of (.+)$/i);
  if (match) return `${translatePhrase(match[1])}关节囊`;

  match = value.match(/^Accompanying veins of (.+)$/i);
  if (match) return `${translatePhrase(match[1])}伴行静脉`;

  match = value.match(/^Perforating branches \((.+)\)$/i);
  if (match) return `穿通支（${translateProperName(match[1])}）`;

  match = value.match(/^Sup, Inf, Ant, Post, Pubic ligaments$/i);
  if (match) return "上、下、前、后及耻骨韧带";

  return "";
}

function translatePhrase(value) {
  const text = normalizeTranslationSource(value);
  if (!text) return "";
  const exact = getExactTranslation(text);
  if (exact) return exact;
  const wholePhrase = PHRASE_TRANSLATIONS.find(
    ([source]) => source.toLowerCase() === text.toLowerCase(),
  );
  if (wholePhrase) return wholePhrase[1];

  const parenthetical = text.match(/^(.+?)\s*\((.+)\)$/);
  if (parenthetical) {
    return `${translatePhrase(parenthetical[1])}（${translatePhrase(parenthetical[2])}）`;
  }

  const special = translateSpecialPattern(text);
  if (special) return special;

  const ofIndex = text.toLowerCase().lastIndexOf(" of ");
  if (ofIndex > 0) {
    const left = text.slice(0, ofIndex);
    const right = text.slice(ofIndex + 4);
    return `${translatePhrase(right)}${translatePhrase(left)}`;
  }

  if (/\s+and\s+/i.test(text)) {
    return text
      .split(/\s+and\s+/i)
      .map((part) => translatePhrase(part))
      .join("和");
  }

  if (/\s+or\s+/i.test(text)) {
    return text
      .split(/\s+or\s+/i)
      .map((part) => translatePhrase(part))
      .join("或");
  }

  let translated = text;
  PHRASE_TRANSLATIONS.forEach(([source, target]) => {
    translated = translated.replace(
      new RegExp(`\\b${escapeRegExp(source)}\\b`, "gi"),
      target,
    );
  });
  return tidyTranslatedName(translated);
}

function translateOrdinal(value) {
  return TOE_ORDINAL_TRANSLATIONS[String(value).toLowerCase()] || String(value);
}

function getExactTranslation(value) {
  if (EXACT_NAME_TRANSLATIONS[value]) return EXACT_NAME_TRANSLATIONS[value];
  const lower = String(value).toLowerCase();
  const entry = Object.entries(EXACT_NAME_TRANSLATIONS).find(
    ([key]) => key.toLowerCase() === lower,
  );
  return entry?.[1] || "";
}

function translatePosition(value) {
  const positions = {
    distal: "远节",
    middle: "中节",
    proximal: "近节",
  };
  return positions[String(value).toLowerCase()] || value;
}

function translateProperName(value) {
  return value
    .replace(/Boyd's veins/i, "Boyd 静脉")
    .replace(/Cockett's veins/i, "Cockett 静脉")
    .replace(/Dodd's veins/i, "Dodd 静脉");
}

function tidyTranslatedName(value) {
  return value
    .replace(/([\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])/g, "$1")
    .replace(/\s+([），、])/g, "$1")
    .replace(/([（，、])\s+/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function containsChinese(value) {
  return /[\u4e00-\u9fff]/.test(value);
}

function cleanName(name) {
  return name
    .replace(/[\u200b\u200c\u200d\ufeff]/g, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/(?:[.\s_-]+r)$/i, "")
    .trim();
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function layerRole(layer) {
  const roles = {
    bone: "形成下肢和足部的骨性支架，承担负重并提供肌肉、韧带附着点。",
    cartilage: "覆盖关节面或构成半月板等软骨结构，降低摩擦并分散压力。",
    ligament: "连接骨与骨或形成筋膜/支持带，稳定关节并限制异常运动。",
    muscle: "产生下肢和足部运动，维持姿势、步态和足弓动态稳定。",
    artery: "向下肢组织输送含氧血液。",
    vein: "负责下肢静脉回流。",
    nerve: "传导感觉和运动信号，支配肌肉并提供皮肤感觉。",
    fascia: "包绕和分隔组织，为肌肉与肌腱提供支持。",
    bursa: "减少相邻肌腱、骨和软组织之间运动时的摩擦。",
  };
  return roles[layer] || "参与真实下肢解剖结构的空间组织。";
}
