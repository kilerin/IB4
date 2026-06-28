# -*- coding: utf-8 -*-
import urllib.parse, html

# Каждое блюдо: (turkish, russian_name, russian_desc, price, emoji, image_prompt_en)
SECTIONS = [
    ("Мезе", "MEZELER", "🫒", [
        ("Peynir Tabağı", "Сырная тарелка", "Ассорти турецких сыров", "240", "🧀", "turkish cheese plate assortment, restaurant food photography"),
        ("Arnavut Ciğeri", "Печень по-албански", "Обжаренные кусочки печени с луком", "440", "🍖", "arnavut cigeri fried liver cubes with onions, turkish meze"),
        ("Beyin Söğüş", "Бараньи мозги", "Отварные мозги с зеленью и лимоном", "540", "🍲", "boiled lamb brain salad with lemon and parsley, turkish meze"),
        ("Atom", "Атом", "Острый йогурт с перцем чили и маслом", "240", "🌶️", "atom spicy yogurt with chili oil, turkish meze"),
        ("Girit Ezme", "Критская паста", "Паста из сыра с зеленью", "320", "🥗", "girit ezme cretan cheese herb dip, turkish meze"),
        ("Şakşuka", "Шакшука", "Жареные баклажаны в томатном соусе", "360", "🍆", "turkish saksuka fried eggplant in tomato sauce"),
        ("Köpoğlu", "Кёпоглу", "Жареные баклажаны с йогуртом и томатом", "360", "🍆", "kopoglu fried eggplant with yogurt and tomato sauce"),
        ("Patlıcan Salatası", "Баклажанная икра", "Салат из печёных баклажанов", "240", "🍆", "smoked eggplant salad puree, turkish meze"),
        ("Yoğurtlu Semiz", "Портулак в йогурте", "Зелень портулака с чесночным йогуртом", "170", "🥬", "purslane with garlic yogurt, turkish meze"),
        ("Kuru Cacık", "Сухой джаджик", "Густой йогурт с огурцом и чесноком", "320", "🥒", "thick cacik yogurt cucumber garlic dip"),
        ("Mütebbel", "Мутаббаль", "Паста из печёных баклажанов с тахини", "290", "🍆", "mutabbal baba ganoush eggplant tahini dip"),
        ("Havuç Tarator", "Морковный таратор", "Тёртая морковь с йогуртом", "290", "🥕", "carrot tarator yogurt dip, turkish meze"),
        ("Deniz Börülcesi", "Морская фасоль", "Солерос с оливковым маслом и лимоном", "310", "🌿", "sea beans samphire with olive oil lemon, turkish meze"),
        ("Barbunya Pilaki", "Фасоль пиляки", "Тушёная фасоль в оливковом масле", "310", "🫘", "barbunya pilaki stewed beans in olive oil"),
        ("Fava", "Фава", "Пюре из жёлтых бобов с луком", "410", "🫛", "fava bean puree with onion and dill, turkish meze"),
        ("Humus", "Хумус", "Паста из нута с тахини", "410", "🧆", "hummus chickpea dip with olive oil"),
        ("Pastırmalı Humus", "Хумус с пастырмой", "Тёплый хумус с вяленым мясом", "390", "🧆", "warm hummus topped with pastirma cured beef"),
        ("Çanak Enginar", "Артишоки в горшочке", "Артишоки в оливковом масле", "510", "🌱", "artichoke hearts in olive oil clay pot, turkish meze"),
        ("Kırma Yeşil Zeytin", "Дроблёные зелёные оливки", "Оливки с грецким орехом и гранатом", "310", "🫒", "cracked green olives with walnut pomegranate, turkish meze"),
        ("Sıcak Ot", "Тёплая зелень", "Сезонные травы, обжаренные с чесноком", "290", "🌿", "sauteed wild greens with garlic, turkish meze"),
        ("Kabak Mücver", "Оладьи из кабачков", "Хрустящие оладьи с зеленью", "260", "🥒", "zucchini fritters mucver with herbs, turkish food"),
        ("Ayva Cacık", "Джаджик с айвой", "Йогурт с айвой", "340", "🍐", "quince yogurt dip, turkish meze"),
        ("Piyaz", "Пияз", "Салат из белой фасоли с луком", "290", "🫘", "piyaz white bean salad with onion egg tomato"),
        ("Kabak Şayan", "Кабачки шаян", "Кабачки в особом соусе", "340", "🥒", "stuffed zucchini turkish style dish"),
        ("Rus Salatası", "Салат Оливье", "Классический салат с майонезом", "240", "🥗", "russian salad olivier with mayonnaise"),
        ("Acılı Ezme", "Острая паста аджылы эзме", "Перетёртые томаты и перец с зеленью", "240", "🌶️", "acili ezme spicy tomato pepper dip, turkish meze"),
        ("Haydari", "Хайдари", "Густой йогурт с чесноком и мятой", "230", "🥣", "haydari thick strained yogurt dip with herbs"),
    ]),
    ("Горячие закуски", "ARA SICAKLAR", "🍳", [
        ("Söğüş Tabağı", "Тарелка сёгюш", "Ассорти из холодных субпродуктов", "340", "🍽️", "turkish sogus cold cut appetizer plate"),
        ("Tereyağlı İstiridye Mantarı", "Вёшенки на сливочном масле", "Грибы вёшенки, жаренные на масле", "340", "🍄", "oyster mushrooms sauteed in butter, turkish food"),
        ("Kaşarlı Mantar", "Грибы с сыром кашар", "Грибы, запечённые с сыром", "450", "🍄", "mushrooms baked with kasar cheese, turkish food"),
        ("Paçanga Böreği", "Бёрек пачанга", "Хрустящий рулет с пастырмой и сыром", "300", "🥟", "pacanga boregi crispy rolls with pastirma and cheese"),
        ("Patates Kızartması", "Картофель фри", "Хрустящий жареный картофель", "260", "🍟", "golden french fries, restaurant"),
        ("Yoğurtlama", "Йогуртлама", "Мясо с томатным соусом и йогуртом на лаваше", "480", "🍲", "yogurtlama meat with yogurt and tomato sauce on pita"),
        ("Saganaki", "Саганаки", "Жареный сыр по-гречески", "350", "🧀", "saganaki fried greek cheese"),
    ]),
    ("Морепродукты", "DENİZ ÜRÜNLERİ", "🦐", [
        ("Karides Tava", "Креветки на сковороде", "Креветки в томатно-чесночном соусе", "900", "🦐", "shrimp casserole karides guvec in tomato sauce, turkish"),
        ("Kalamar Tava", "Жареные кальмары", "Кальмары в кляре с соусом", "1100", "🦑", "fried calamari rings with sauce"),
        ("Jumbo Karides Izgara", "Креветки джамбо гриль", "Крупные креветки на гриле", "1100", "🦐", "grilled jumbo shrimp prawns on plate"),
    ]),
    ("Основные блюда", "ANA YEMEK", "🍖", [
        ("Çökertme Kebabı", "Кебаб чёкертме", "Тонкая говядина с картофелем-соломкой и йогуртом", "1390", "🥙", "cokertme kebab beef with shoestring potatoes yogurt tomato sauce"),
        ("Lokum", "Локум (кебаб)", "Нежная мраморная говядина на гриле", "1180", "🥩", "tender grilled beef tenderloin cubes lokum kebab"),
        ("Saç Kavurma", "Сач кавурма", "Мясо, жаренное на садже с овощами", "1350", "🍳", "sac kavurma sauteed meat with vegetables on iron plate"),
        ("Beğendi Yatağında Rahat Köfte", "Кёфте на пюре из баклажанов", "Котлеты на нежном баклажанном пюре", "1100", "🍖", "kofte meatballs on hunkar begendi eggplant puree"),
        ("Vegan Güveç", "Веган гювеч", "Овощное рагу в горшочке", "800", "🥘", "vegetable guvec stew clay pot, turkish vegan"),
    ]),
    ("Субпродукты", "SAKATAT", "🔥", [
        ("Atom Kokoreç", "Кокореч атом", "Кокореч с острым соусом", "1100", "🌭", "kokorec grilled offal with spicy sauce, turkish street food"),
        ("Kuzu Böbrek", "Бараньи почки", "Почки на гриле", "900", "🍢", "grilled lamb kidneys skewers"),
        ("Dil Lokum", "Язык локум", "Нежный говяжий язык", "900", "🍖", "sliced beef tongue dish"),
        ("Dil Söğüş", "Язык холодный", "Отварной язык с зеленью", "760", "🍖", "cold boiled beef tongue slices with greens"),
        ("Dil Izgara", "Язык на гриле", "Говяжий язык на гриле", "900", "🔥", "grilled beef tongue slices"),
        ("Yaprak Ciğer", "Печень тонкими ломтиками", "Хрустящая жареная печень", "1100", "🍖", "yaprak ciger thinly sliced fried liver, turkish"),
        ("Uykuluk", "Зобная железа", "Нежная телячья железа на гриле", "900", "🔥", "grilled sweetbreads uykuluk, turkish"),
    ]),
    ("Гриль и мангал", "IZGARALAR", "🔥", [
        ("Adana Kebap", "Адана кебаб", "Острый рубленый кебаб на шампуре", "1100", "🌶️", "adana kebab spicy minced meat skewer with rice"),
        ("Urfa Kebap", "Урфа кебаб", "Неострый рубленый кебаб на шампуре", "1100", "🥙", "urfa kebab minced meat skewer mild with rice"),
        ("Kuzu Şiş", "Шиш из баранины", "Кусочки баранины на шампуре", "1150", "🍢", "lamb shish kebab skewer grilled"),
        ("Izgara Köfte", "Кёфте на гриле", "Сочные котлетки на мангале", "900", "🍢", "grilled kofte meatballs on plate"),
        ("Ciğer Şiş", "Печень на шампуре", "Кусочки печени на мангале", "1100", "🍢", "grilled liver skewers ciger sis"),
        ("Izgara Kokoreç", "Кокореч на гриле", "Кокореч с зеленью и специями", "1100", "🌭", "grilled kokorec offal wrap, turkish"),
        ("Şaşlık", "Шашлык", "Сочные кусочки мяса на углях", "1300", "🍢", "shashlik grilled meat skewer on charcoal"),
        ("Külbastı Tavuk", "Курица кюльбасты", "Маринованная курица на гриле", "750", "🍗", "grilled marinated chicken kulbasti"),
        ("Vegan Izgara", "Овощи на гриле", "Сезонные овощи на мангале", "540", "🥗", "grilled vegetables platter, vegan"),
        ("Jumbo Karides Izgara", "Креветки джамбо гриль", "Крупные креветки на углях", "1100", "🦐", "grilled jumbo prawns on charcoal"),
    ]),
    ("Салаты", "SALATALAR", "🥗", [
        ("Roka Salatası", "Салат с рукколой", "Руккола с пармезаном и лимоном", "460", "🥬", "arugula rocket salad with parmesan lemon"),
        ("Yeşil Salata", "Зелёный салат", "Микс свежей зелени", "410", "🥗", "fresh green garden salad"),
        ("İstanbul Salata", "Салат Стамбул", "Овощной салат по-стамбульски", "410", "🥗", "istanbul mixed vegetable salad"),
        ("Mevsim Salata", "Сезонный салат", "Салат из сезонных овощей", "420", "🥗", "seasonal vegetable salad bowl"),
        ("Greek Salata", "Греческий салат", "Овощи с сыром фета и оливками", "410", "🧀", "greek salad with feta olives"),
        ("Gavurdağı Salatası", "Гавурдагы салат", "Томаты, перец и грецкий орех", "460", "🍅", "gavurdagi salad tomato pepper walnut, turkish"),
        ("Dakos Salata", "Салат дакос", "Критский салат с сухариками и фетой", "420", "🥗", "dakos cretan salad with rusks tomato feta"),
    ]),
    ("Десерты", "TATLILAR", "🍮", [
        ("Cevizli Fırın Helva", "Печёная халва с орехами", "Тёплая халва с грецким орехом", "360", "🍮", "baked semolina halva with walnuts, turkish dessert"),
        ("Girit Tatlısı", "Критский десерт", "Сладость по-критски", "360", "🍯", "cretan dessert with syrup and nuts"),
        ("Meyve Tabağı (на 2 персоны)", "Фруктовая тарелка (2 чел.)", "Ассорти свежих фруктов", "360", "🍉", "fresh fruit platter assortment for two"),
        ("Meyve Tabağı (на 4 персоны)", "Фруктовая тарелка (4 чел.)", "Большое ассорти фруктов", "480", "🍉", "large fresh fruit platter assortment"),
        ("Rahat Krep Krepowiç", "Блинчик «Рахат»", "Фирменный десертный блинчик", "240", "🥞", "dessert crepe with chocolate and fruit"),
    ]),
]

def img_url(prompt, seed):
    p = urllib.parse.quote(prompt)
    return f"https://image.pollinations.ai/prompt/{p}?width=500&height=360&nologo=true&model=flux&seed={seed}"

cards = []
nav = []
seed = 10
for title, tr_title, sec_emoji, items in SECTIONS:
    anchor = "sec" + str(SECTIONS.index((title, tr_title, sec_emoji, items)))
    nav.append(f'<a href="#{anchor}">{sec_emoji} {html.escape(title)}</a>')
    cards.append(f'<section id="{anchor}"><h2><span class="ico">{sec_emoji}</span> {html.escape(title)} <span class="tr">{html.escape(tr_title)}</span></h2><div class="grid">')
    for tr, ru, desc, price, emoji, prompt in items:
        seed += 1
        url = img_url(prompt, seed)
        cards.append(f'''
        <article class="card">
          <div class="ph">
            <img loading="lazy" src="{url}" alt="{html.escape(ru)}"
                 onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
            <div class="fallback" style="display:none">{emoji}</div>
          </div>
          <div class="body">
            <div class="row"><h3>{html.escape(ru)}</h3><span class="price">{price} ₺</span></div>
            <div class="orig">{html.escape(tr)}</div>
            <p class="desc">{html.escape(desc)}</p>
          </div>
        </article>''')
    cards.append('</div></section>')

HTML = f'''<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Rahat Meyhane — Меню</title>
<style>
  :root{{--bg:#1a1410;--card:#241c16;--gold:#d9a441;--cream:#f3e9d8;--muted:#b9a890;--line:#3a2e23;}}
  *{{box-sizing:border-box;}}
  body{{margin:0;font-family:"Segoe UI",Roboto,Helvetica,Arial,sans-serif;background:var(--bg);color:var(--cream);}}
  header.top{{text-align:center;padding:42px 20px 26px;background:radial-gradient(circle at 50% 0%,#2c2118,#1a1410);border-bottom:2px solid var(--gold);}}
  header.top .brand{{font-size:46px;font-weight:800;letter-spacing:4px;color:var(--gold);}}
  header.top .sub{{font-size:16px;letter-spacing:8px;text-transform:uppercase;color:var(--muted);margin-top:6px;}}
  header.top .ru{{margin-top:14px;font-size:15px;color:var(--cream);opacity:.85;}}
  nav{{position:sticky;top:0;z-index:5;display:flex;flex-wrap:wrap;gap:6px;justify-content:center;
       padding:12px;background:rgba(26,20,16,.96);border-bottom:1px solid var(--line);backdrop-filter:blur(6px);}}
  nav a{{color:var(--cream);text-decoration:none;font-size:13px;padding:6px 12px;border:1px solid var(--line);
        border-radius:20px;transition:.2s;}}
  nav a:hover{{background:var(--gold);color:#1a1410;border-color:var(--gold);}}
  main{{max-width:1180px;margin:0 auto;padding:24px 16px 60px;}}
  section{{margin-top:40px;}}
  h2{{font-size:26px;color:var(--gold);border-bottom:1px solid var(--line);padding-bottom:10px;
      display:flex;align-items:center;gap:10px;}}
  h2 .ico{{font-size:24px;}}
  h2 .tr{{font-size:13px;color:var(--muted);letter-spacing:2px;text-transform:uppercase;margin-left:auto;}}
  .grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:18px;margin-top:20px;}}
  .card{{background:var(--card);border:1px solid var(--line);border-radius:14px;overflow:hidden;
         display:flex;flex-direction:column;transition:transform .18s,box-shadow .18s;}}
  .card:hover{{transform:translateY(-4px);box-shadow:0 10px 28px rgba(0,0,0,.45);border-color:var(--gold);}}
  .ph{{position:relative;width:100%;aspect-ratio:5/3.6;background:#2e231b;}}
  .ph img{{width:100%;height:100%;object-fit:cover;display:block;}}
  .fallback{{position:absolute;inset:0;align-items:center;justify-content:center;font-size:74px;background:linear-gradient(135deg,#2e231b,#241c16);}}
  .body{{padding:14px 15px 16px;display:flex;flex-direction:column;gap:6px;flex:1;}}
  .row{{display:flex;justify-content:space-between;align-items:baseline;gap:8px;}}
  h3{{margin:0;font-size:17px;color:var(--cream);}}
  .price{{color:var(--gold);font-weight:700;font-size:16px;white-space:nowrap;}}
  .orig{{font-size:12px;color:var(--muted);font-style:italic;letter-spacing:.3px;}}
  .desc{{margin:4px 0 0;font-size:13px;color:#cdbfa9;line-height:1.45;}}
  footer{{text-align:center;padding:30px 20px;color:var(--muted);font-size:13px;border-top:1px solid var(--line);}}
  @media(max-width:480px){{header.top .brand{{font-size:34px;}} .grid{{grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;}}}}
</style>
</head>
<body>
<header class="top">
  <div class="brand">RAHAT</div>
  <div class="sub">meyhane</div>
  <div class="ru">Турецкая мейхане · Меню на русском языке</div>
</header>
<nav>{''.join(nav)}</nav>
<main>
{''.join(cards)}
</main>
<footer>
  Цены указаны в турецких лирах (₺) и могут отличаться от актуальных. ·
  Изображения блюд иллюстративны (генерируются автоматически).
</footer>
</body>
</html>'''

import os
out = os.path.join(os.path.dirname(__file__), "russian-menu.html")
with open(out, "w", encoding="utf-8") as f:
    f.write(HTML)
n = sum(len(s[3]) for s in SECTIONS)
print("OK", out, "dishes:", n)
