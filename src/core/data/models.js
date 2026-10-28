// Каталог вещей. 80 моделей.
//
// rt    — цена нового оригинала на вторичке, от неё пляшет вся экономика
// hype  — стартовая ликвидность 0..1 (доля таких вещей, что уходит за неделю)
// form  — какой силуэт рисовать, mark — какой логотип класть сверху
// tells — по каким признакам обычно палится подделка этой модели,
//         первый в списке самый частый. Именно это игрок и выучивает по ходу игры.
// ways  — расцветки с названиями: [имя, основной, акцент, деталь]

import { CATS } from './catalog.js';

const w = (n, base, accent, detail) => ({ n, c: [base, accent, detail || base] });

function M(b, n, cat, tier, rt, hype, form, mark, tells, ways) {
  return { b, n, cat, tier, rt, hype, art: { form, mark }, tells, ways };
}

const RAW = [
  /* ---------- НОУНЕЙМ: фон рынка, подделывать нечего ---------- */
  M('Ноунейм', 'футболка', 'tee', 'mass', 650, 0.08, 'tee', 'none', [], [
    w('Серая', 'grey', 'grey'),
    w('Чёрная', 'black', 'black'),
    w('Белая', 'white', 'white'),
  ]),
  M('Ноунейм', 'худи', 'hoodie', 'mass', 1700, 0.08, 'hoodie', 'none', [], [
    w('Серое', 'grey', 'charcoal'),
    w('Чёрное', 'black', 'charcoal'),
  ]),
  M('Ноунейм', 'джинсы', 'pants', 'mass', 1900, 0.08, 'jeans', 'none', [], [
    w('Синие', 'navy', 'navy'),
    w('Чёрные', 'charcoal', 'charcoal'),
  ]),
  M('Ноунейм', 'куртка', 'jacket', 'mass', 3600, 0.08, 'windbreaker', 'none', [], [
    w('Чёрная', 'black', 'charcoal'),
    w('Синяя', 'navy', 'navy'),
  ]),
  M('Ноунейм', 'пуховик', 'puffer', 'mass', 5600, 0.1, 'puffer', 'none', [], [
    w('Чёрный', 'black', 'charcoal'),
    w('Хаки', 'olive', 'olive'),
  ]),
  M('Глория', 'свитшот', 'hoodie', 'mass', 2300, 0.12, 'crew', 'print', ['print', 'tag'], [
    w('Бежевый', 'cream', 'brown'),
    w('Серый', 'grey', 'charcoal'),
  ]),
  M('Зара', 'пальто', 'jacket', 'mass', 7800, 0.2, 'workwear', 'none', ['tag', 'stitch'], [
    w('Кемел', 'tan', 'brown'),
    w('Чёрное', 'black', 'charcoal'),
  ]),
  M('Юникло', 'лёгкий пуховик', 'puffer', 'mass', 6800, 0.34, 'vest', 'none', ['tag', 'hardware'], [
    w('Чёрный', 'black', 'charcoal'),
    w('Хаки', 'olive', 'olive'),
    w('Синий', 'navy', 'navy'),
  ]),

  /* ---------- МАСС-МАРКЕТ С ИМЕНЕМ ---------- */
  M('Томми', 'свитшот', 'hoodie', 'mass', 7200, 0.3, 'crew', 'flag', ['print', 'tag', 'stitch'], [
    w('Белый', 'white', 'navy'),
    w('Тёмно-синий', 'navy', 'red'),
  ]),
  M('Лакост', 'поло', 'polo', 'street', 9200, 0.35, 'polo', 'crest', ['print', 'tag', 'stitch'], [
    w('Белое', 'white', 'green'),
    w('Зелёное', 'green', 'white'),
    w('Тёмно-синее', 'navy', 'white'),
  ]),
  M('Ралф', 'поло', 'polo', 'street', 10800, 0.5, 'polo', 'crest', ['print', 'tag', 'shape'], [
    w('Синее', 'navy', 'white'),
    w('Красное', 'red', 'white'),
    w('Белое', 'white', 'navy'),
  ]),
  M('Ралф', 'свитер с мишкой', 'knit', 'prem', 23000, 0.55, 'knit', 'patch', ['print', 'stitch', 'tag'], [
    w('Тёмно-синий', 'navy', 'cream'),
    w('Серый', 'grey', 'cream'),
  ]),
  M('Ралф', 'кепка', 'cap', 'mass', 5200, 0.4, 'cap', 'crest', ['print', 'tag'], [
    w('Тёмно-синяя', 'navy', 'white'),
    w('Бежевая', 'sand', 'navy'),
  ]),
  M('Левайсы', '501', 'pants', 'street', 8600, 0.4, 'jeans', 'patch', ['tag', 'stitch', 'hardware'], [
    w('Классика', 'navy', 'navy'),
    w('Чёрные', 'charcoal', 'charcoal'),
    w('Светлые', 'sky', 'sky'),
  ]),

  /* ---------- КРОССОВКИ: СТРИТВИР ---------- */
  M('Найк', 'Форсы', 'shoes', 'street', 12500, 0.55, 'lowtop', 'swoosh', ['sole', 'box', 'tag', 'smell'], [
    w('Белые', 'white', 'white', 'white'),
    w('Чёрные', 'black', 'black', 'black'),
    w('Тройной белый', 'white', 'silver', 'white'),
  ]),
  M('Найк', 'Данки', 'shoes', 'street', 14500, 0.62, 'lowtop', 'swoosh', ['sole', 'shape', 'box', 'tag'], [
    w('Панда', 'white', 'black', 'white'),
    w('Мичиган', 'white', 'yellow', 'white'),
    w('Сиракьюс', 'white', 'navy', 'white'),
  ]),
  M('Найк', 'ТНки', 'shoes', 'street', 18000, 0.7, 'chunky', 'swoosh', ['sole', 'smell', 'box', 'hardware'], [
    w('Триппл блэк', 'black', 'charcoal', 'black'),
    w('Акулы', 'white', 'blue', 'silver'),
  ]),
  M('Найк', 'Эйр Макс 90', 'shoes', 'street', 13800, 0.44, 'runner', 'swoosh', ['sole', 'stitch', 'box'], [
    w('Инфраред', 'white', 'red', 'grey'),
    w('Чёрно-белые', 'white', 'black', 'grey'),
  ]),
  M('Найк', 'Блейзер Мид', 'shoes', 'street', 10200, 0.38, 'hightop', 'swoosh', ['sole', 'tag', 'stitch'], [
    w('Винтаж', 'white', 'black', 'gum'),
    w('Белые', 'white', 'grey', 'white'),
  ]),
  M('Найк', 'Вейпормакс', 'shoes', 'street', 19500, 0.48, 'chunky', 'swoosh', ['sole', 'hardware', 'smell'], [
    w('Чёрные', 'black', 'charcoal', 'charcoal'),
    w('Белые', 'white', 'silver', 'ice'),
  ]),
  M('Джорданы', '1 High', 'shoes', 'prem', 22000, 0.6, 'hightop', 'wing', ['sole', 'shape', 'box', 'stitch'], [
    w('Чикаго', 'white', 'red', 'black'),
    w('Брэд', 'black', 'red', 'black'),
    w('Роял', 'black', 'blue', 'black'),
  ]),
  M('Джорданы', '4', 'shoes', 'prem', 27000, 0.68, 'chunky', 'wing', ['sole', 'shape', 'hardware', 'box'], [
    w('Мокко', 'sand', 'brown', 'cream'),
    w('Бред', 'white', 'red', 'black'),
    w('Блэк кэт', 'black', 'charcoal', 'black'),
  ]),
  M('Джорданы', '3', 'shoes', 'prem', 25000, 0.52, 'chunky', 'wing', ['sole', 'print', 'box'], [
    w('Белый цемент', 'white', 'grey', 'red'),
    w('Чёрный цемент', 'black', 'grey', 'red'),
  ]),
  M('Адик', 'Самбы', 'shoes', 'street', 11500, 0.72, 'lowtop', 'stripes3', ['shape', 'sole', 'tag', 'stitch'], [
    w('Классика', 'white', 'black', 'gum'),
    w('Чёрные', 'black', 'white', 'gum'),
    w('Бежевые', 'cream', 'brown', 'gum'),
  ]),
  M('Адик', 'Кампусы', 'shoes', 'street', 10500, 0.5, 'lowtop', 'stripes3', ['shape', 'tag', 'sole'], [
    w('Замша серая', 'grey', 'white', 'gum'),
    w('Зелёные', 'green', 'white', 'gum'),
    w('Бордовые', 'burgundy', 'white', 'gum'),
  ]),
  M('Адик', 'Газели', 'shoes', 'street', 11000, 0.55, 'lowtop', 'stripes3', ['shape', 'stitch', 'tag'], [
    w('Синие', 'navy', 'white', 'gum'),
    w('Красные', 'red', 'white', 'gum'),
  ]),
  M('Адик', 'Спешиалы', 'shoes', 'street', 12000, 0.6, 'lowtop', 'stripes3', ['sole', 'shape', 'tag'], [
    w('Чёрно-белые', 'black', 'white', 'white'),
    w('Синие', 'navy', 'white', 'white'),
  ]),
  M('Адик', 'олимпийка', 'jacket', 'street', 8200, 0.45, 'coach', 'stripes3', ['tag', 'hardware', 'print'], [
    w('Чёрная', 'black', 'white'),
    w('Синяя', 'navy', 'white'),
    w('Бордовая', 'burgundy', 'white'),
  ]),
  M('Адик', 'штаны с лампасами', 'pants', 'street', 6800, 0.42, 'track', 'stripes3', ['tag', 'stitch'], [
    w('Чёрные', 'black', 'white'),
    w('Синие', 'navy', 'white'),
  ]),
  M('Нюбы', '550', 'shoes', 'street', 13500, 0.56, 'lowtop', 'nletter', ['shape', 'sole', 'tag'], [
    w('Белый/зелёный', 'white', 'green', 'white'),
    w('Белый/серый', 'white', 'grey', 'white'),
  ]),
  M('Нюбы', '9060', 'shoes', 'street', 17500, 0.68, 'chunky', 'nletter', ['sole', 'shape', 'box'], [
    w('Си солт', 'bone', 'grey', 'ice'),
    w('Серые', 'grey', 'silver', 'white'),
  ]),
  M('Нюбы', '2002R', 'shoes', 'street', 16000, 0.58, 'runner', 'nletter', ['sole', 'smell', 'shape'], [
    w('Протектор пэк', 'grey', 'silver', 'white'),
    w('Бежевые', 'sand', 'tan', 'cream'),
  ]),
  M('Нюбы', '530', 'shoes', 'mass', 12000, 0.5, 'runner', 'nletter', ['sole', 'tag'], [
    w('Белые/серебро', 'white', 'silver', 'ice'),
    w('Белые/синие', 'white', 'navy', 'ice'),
  ]),
  M('Асиксы', 'Гель Кахана', 'shoes', 'street', 13000, 0.5, 'trail', 'stripes3', ['sole', 'hardware', 'smell'], [
    w('Чёрно-жёлтые', 'black', 'yellow', 'charcoal'),
    w('Серо-синие', 'grey', 'blue', 'charcoal'),
  ]),
  M('Асиксы', 'Гель-1130', 'shoes', 'street', 12500, 0.55, 'runner', 'stripes3', ['sole', 'shape', 'tag'], [
    w('Белые/серебро', 'white', 'silver', 'ice'),
    w('Крем', 'cream', 'tan', 'bone'),
  ]),
  M('Саломоны', 'XT-6', 'shoes', 'prem', 21000, 0.6, 'trail', 'arrow', ['sole', 'hardware', 'shape'], [
    w('Чёрные', 'black', 'charcoal', 'charcoal'),
    w('Белые', 'white', 'silver', 'ice'),
  ]),
  M('Конверсы', 'Чак 70', 'shoes', 'mass', 9200, 0.35, 'hightop', 'star', ['sole', 'tag', 'stitch'], [
    w('Чёрные', 'black', 'white', 'cream'),
    w('Белые', 'white', 'black', 'cream'),
  ]),
  M('Вансы', 'Олд Скул', 'shoes', 'mass', 7800, 0.3, 'skate', 'wave', ['sole', 'stitch', 'tag'], [
    w('Чёрно-белые', 'black', 'white', 'white'),
    w('Синие', 'navy', 'white', 'white'),
  ]),
  M('Мартинсы', '1460', 'shoes', 'street', 17000, 0.38, 'boot', 'script', ['sole', 'stitch', 'smell', 'hardware'], [
    w('Чёрные', 'black', 'yellow', 'black'),
    w('Вишнёвые', 'burgundy', 'yellow', 'black'),
  ]),
  M('Тимбы', 'жёлтые', 'shoes', 'street', 18500, 0.42, 'boot', 'tree', ['sole', 'smell', 'stitch'], [
    w('Пшеничные', 'yellow', 'brown', 'gum'),
    w('Чёрные', 'black', 'charcoal', 'black'),
  ]),
  M('Хоки', 'Бондай', 'shoes', 'street', 16500, 0.46, 'chunky', 'arrow', ['sole', 'shape', 'smell'], [
    w('Белые', 'white', 'silver', 'ice'),
    w('Чёрные', 'black', 'charcoal', 'charcoal'),
  ]),
  M('Вежа', 'Эска', 'shoes', 'street', 14000, 0.36, 'lowtop', 'vmark', ['sole', 'tag', 'stitch'], [
    w('Белые/синие', 'white', 'navy', 'white'),
    w('Белые/красные', 'white', 'red', 'white'),
  ]),

  /* ---------- СТРИТВИР: ОДЕЖДА ---------- */
  M('Найк', 'Теч Флис', 'hoodie', 'street', 14000, 0.68, 'zip', 'swoosh', ['hardware', 'tag', 'shape', 'print'], [
    w('Серый', 'grey', 'charcoal'),
    w('Чёрный', 'black', 'charcoal'),
    w('Хаки', 'olive', 'charcoal'),
  ]),
  M('Найк', 'штаны Теч Флис', 'pants', 'street', 11000, 0.62, 'sweat', 'swoosh', ['hardware', 'tag', 'shape'], [
    w('Серые', 'grey', 'charcoal'),
    w('Чёрные', 'black', 'charcoal'),
  ]),
  M('Кархарт', 'худи', 'hoodie', 'street', 10800, 0.5, 'hoodie', 'patch', ['tag', 'print', 'stitch'], [
    w('Чёрное', 'black', 'white'),
    w('Хаки', 'olive', 'white'),
    w('Бежевое', 'sand', 'brown'),
  ]),
  M('Кархарт', 'штаны Double Knee', 'pants', 'street', 12800, 0.56, 'cargo', 'patch', ['tag', 'stitch', 'hardware'], [
    w('Хаки', 'sand', 'brown'),
    w('Чёрные', 'black', 'charcoal'),
  ]),
  M('Кархарт', 'шапка', 'cap', 'mass', 3600, 0.52, 'beanie', 'patch', ['tag', 'print'], [
    w('Чёрная', 'black', 'white'),
    w('Оранжевая', 'orange', 'white'),
    w('Хаки', 'olive', 'white'),
  ]),
  M('Кархарт', 'куртка Детройт', 'jacket', 'prem', 25000, 0.55, 'workwear', 'patch', ['tag', 'hardware', 'stitch', 'smell'], [
    w('Хаки', 'sand', 'brown'),
    w('Чёрная', 'black', 'charcoal'),
  ]),
  M('Стусси', 'худи', 'hoodie', 'street', 13500, 0.56, 'hoodie', 'script', ['print', 'tag', 'stitch'], [
    w('Чёрное', 'black', 'white'),
    w('Серое', 'grey', 'black'),
    w('Бежевое', 'cream', 'black'),
  ]),
  M('Стусси', 'футболка', 'tee', 'street', 5800, 0.5, 'tee', 'script', ['print', 'tag'], [
    w('Белая', 'white', 'black'),
    w('Чёрная', 'black', 'white'),
  ]),
  M('Суприм', 'бокс-лого футболка', 'tee', 'prem', 11000, 0.5, 'tee', 'boxlogo', ['print', 'tag', 'stitch'], [
    w('Белая', 'white', 'red'),
    w('Чёрная', 'black', 'red'),
  ]),
  M('Суприм', 'худи с бокс-лого', 'hoodie', 'prem', 29000, 0.6, 'hoodie', 'boxlogo', ['print', 'tag', 'stitch', 'shape'], [
    w('Серое', 'grey', 'red'),
    w('Чёрное', 'black', 'red'),
  ]),
  M('Кортейз', 'карго', 'pants', 'street', 11800, 0.52, 'cargo', 'compass', ['print', 'tag', 'hardware'], [
    w('Чёрные', 'black', 'white'),
    w('Хаки', 'olive', 'white'),
  ]),
  M('Трапстар', 'куртка', 'jacket', 'prem', 29000, 0.45, 'varsity', 'script', ['print', 'hardware', 'tag'], [
    w('Чёрная', 'black', 'white'),
    w('Синяя', 'navy', 'white'),
  ]),
  M('Палас', 'худи Три-Ферг', 'hoodie', 'prem', 18500, 0.45, 'hoodie', 'triangle', ['print', 'tag', 'stitch'], [
    w('Чёрное', 'black', 'white'),
    w('Синее', 'navy', 'white'),
  ]),
  M('Бейпи', 'шарк худи', 'hoodie', 'prem', 34000, 0.5, 'zip', 'shark', ['print', 'hardware', 'stitch', 'tag'], [
    w('Камуфляж', 'olive', 'lime'),
    w('Фиолетовое', 'purple', 'lilac'),
  ]),
  M('Фиргод', 'эссентиалс худи', 'hoodie', 'prem', 17000, 0.58, 'hoodie', 'print', ['print', 'shape', 'tag'], [
    w('Песочное', 'sand', 'cream'),
    w('Серое', 'grey', 'white'),
    w('Чёрное', 'black', 'grey'),
  ]),

  /* ---------- ПРЕМИУМ: ВЕРХ ---------- */
  M('Норс', 'пуховик Нупси', 'puffer', 'prem', 37000, 0.62, 'puffer', 'halfdome', ['hardware', 'tag', 'stitch', 'smell'], [
    w('Чёрный', 'black', 'white'),
    w('Хаки', 'olive', 'white'),
    w('Синий', 'navy', 'white'),
  ]),
  M('Норс', 'шапка', 'cap', 'street', 4400, 0.45, 'beanie', 'halfdome', ['print', 'tag'], [
    w('Чёрная', 'black', 'white'),
    w('Красная', 'red', 'white'),
  ]),
  M('Норс', 'ветровка 1996', 'jacket', 'prem', 26000, 0.5, 'windbreaker', 'halfdome', ['hardware', 'tag', 'stitch'], [
    w('Чёрная', 'black', 'white'),
    w('Жёлтая', 'yellow', 'black'),
  ]),
  M('Стонник', 'худи с патчем', 'hoodie', 'prem', 37000, 0.65, 'zip', 'compass', ['hardware', 'print', 'tag', 'stitch'], [
    w('Хаки', 'olive', 'white'),
    w('Чёрное', 'black', 'white'),
    w('Серое', 'grey', 'white'),
  ]),
  M('Стонник', 'софтшелл', 'jacket', 'prem', 66000, 0.55, 'softshell', 'compass', ['hardware', 'stitch', 'tag', 'smell'], [
    w('Чёрный', 'black', 'white'),
    w('Хаки', 'olive', 'white'),
  ]),
  M('Стонник', 'свитшот', 'hoodie', 'prem', 27000, 0.55, 'crew', 'compass', ['print', 'tag', 'stitch'], [
    w('Серый', 'grey', 'white'),
    w('Тёмно-синий', 'navy', 'white'),
  ]),
  M('Арк', 'ветровка Бета', 'jacket', 'prem', 54000, 0.6, 'softshell', 'bird', ['hardware', 'stitch', 'tag', 'shape'], [
    w('Чёрная', 'black', 'white'),
    w('Синяя', 'blue', 'white'),
    w('Оранжевая', 'orange', 'white'),
  ]),
  M('Арк', 'флиска', 'hoodie', 'prem', 32000, 0.5, 'zip', 'bird', ['hardware', 'tag', 'shape'], [
    w('Чёрная', 'black', 'white'),
    w('Серая', 'grey', 'white'),
  ]),
  M('Патагон', 'ретро флис', 'hoodie', 'prem', 24000, 0.48, 'zip', 'mountain', ['tag', 'stitch', 'shape'], [
    w('Кремовый', 'cream', 'rust'),
    w('Синий', 'navy', 'cream'),
  ]),

  /* ---------- ЛЮКС ---------- */
  M('Гусь', 'парка', 'puffer', 'lux', 118000, 0.5, 'parka', 'arcticpatch', ['hardware', 'stitch', 'tag', 'smell'], [
    w('Чёрная', 'black', 'red'),
    w('Синяя', 'navy', 'red'),
  ]),
  M('Монка', 'пуховик Майя', 'puffer', 'lux', 148000, 0.55, 'puffer', 'crest', ['hardware', 'stitch', 'tag', 'shape'], [
    w('Чёрный', 'black', 'white'),
    w('Красный', 'red', 'white'),
  ]),
  M('Баленсы', 'Трипл С', 'shoes', 'lux', 92000, 0.4, 'chunky', 'script', ['sole', 'shape', 'smell', 'box'], [
    w('Белые', 'white', 'silver', 'grey'),
    w('Чёрные', 'black', 'charcoal', 'charcoal'),
  ]),
  M('Баленсы', 'худи с логотипом', 'hoodie', 'lux', 78000, 0.45, 'hoodie', 'script', ['print', 'shape', 'tag'], [
    w('Чёрное', 'black', 'white'),
    w('Серое', 'grey', 'black'),
  ]),
  M('Гуча', 'поясная сумка', 'bag', 'lux', 88000, 0.45, 'belt', 'monogram', ['hardware', 'stitch', 'smell', 'tag'], [
    w('Бежевая', 'sand', 'brown'),
    w('Чёрная', 'black', 'gold'),
  ]),
  M('Луи', 'сумка через плечо', 'bag', 'lux', 165000, 0.5, 'shoulder', 'monogram', ['hardware', 'stitch', 'smell', 'shape'], [
    w('Монограм', 'brown', 'tan'),
    w('Дамье', 'chocolate', 'brown'),
  ]),
  M('Прада', 'нейлоновая сумка', 'bag', 'lux', 136000, 0.45, 'tote', 'triangle', ['hardware', 'tag', 'stitch'], [
    w('Чёрная', 'black', 'silver'),
    w('Бежевая', 'sand', 'gold'),
  ]),
  M('Маржела', 'Таби', 'shoes', 'lux', 84000, 0.4, 'mule', 'stitch4', ['shape', 'stitch', 'smell', 'sole'], [
    w('Чёрные', 'black', 'black', 'black'),
    w('Белые', 'white', 'white', 'white'),
  ]),
  M('Дион', 'сумка седло', 'bag', 'lux', 180000, 0.42, 'shoulder', 'monogram', ['hardware', 'stitch', 'smell'], [
    w('Серая', 'grey', 'silver'),
    w('Синяя', 'navy', 'gold'),
  ]),
  M('Ёдзи', 'пальто', 'jacket', 'lux', 125000, 0.3, 'workwear', 'script', ['shape', 'stitch', 'tag'], [
    w('Чёрное', 'black', 'charcoal'),
  ]),

  /* ---------- СУМКИ И РЮКЗАКИ ПОПРОЩЕ ---------- */
  M('Найк', 'рюкзак', 'bag', 'mass', 5200, 0.3, 'backpack', 'swoosh', ['tag', 'hardware', 'stitch'], [
    w('Чёрный', 'black', 'white'),
    w('Синий', 'navy', 'white'),
  ]),
  M('Кархарт', 'сумка через плечо', 'bag', 'street', 6800, 0.5, 'shoulder', 'patch', ['tag', 'hardware', 'stitch'], [
    w('Чёрная', 'black', 'white'),
    w('Хаки', 'olive', 'white'),
  ]),
  M('Стонник', 'панама', 'cap', 'prem', 14000, 0.48, 'bucket', 'compass', ['print', 'tag', 'stitch'], [
    w('Хаки', 'olive', 'white'),
    w('Чёрная', 'black', 'white'),
  ]),
  M('Найк', 'кепка', 'cap', 'mass', 3800, 0.35, 'cap', 'swoosh', ['print', 'tag'], [
    w('Чёрная', 'black', 'white'),
    w('Белая', 'white', 'black'),
  ]),
  M('Адик', 'панама', 'cap', 'mass', 3400, 0.3, 'bucket', 'stripes3', ['print', 'tag'], [
    w('Чёрная', 'black', 'white'),
    w('Бежевая', 'sand', 'white'),
  ]),
  M('Нюбы', 'ветровка', 'jacket', 'street', 9800, 0.4, 'windbreaker', 'nletter', ['tag', 'hardware', 'stitch'], [
    w('Серая', 'grey', 'white'),
    w('Чёрная', 'black', 'white'),
  ]),
  M('Левайсы', 'джинсовка', 'jacket', 'street', 9500, 0.44, 'coach', 'patch', ['tag', 'stitch', 'hardware'], [
    w('Синяя', 'navy', 'navy'),
    w('Светлая', 'sky', 'sky'),
  ]),
  M('Томми', 'поло', 'polo', 'mass', 6400, 0.28, 'polo', 'flag', ['print', 'tag'], [
    w('Белое', 'white', 'navy'),
    w('Синее', 'navy', 'red'),
  ]),
  M('Фиргод', 'эссентиалс штаны', 'pants', 'prem', 14000, 0.55, 'sweat', 'print', ['print', 'shape', 'tag'], [
    w('Песочные', 'sand', 'cream'),
    w('Серые', 'grey', 'white'),
  ]),
  M('Кортейз', 'футболка', 'tee', 'street', 6200, 0.48, 'tee', 'compass', ['print', 'tag'], [
    w('Чёрная', 'black', 'white'),
    w('Белая', 'white', 'black'),
  ]),
  M('Бейпи', 'футболка', 'tee', 'prem', 13000, 0.42, 'tee', 'shark', ['print', 'tag', 'stitch'], [
    w('Белая', 'white', 'lime'),
    w('Чёрная', 'black', 'lime'),
  ]),
  M('Стусси', 'панама', 'cap', 'street', 5600, 0.46, 'bucket', 'script', ['print', 'tag'], [
    w('Чёрная', 'black', 'white'),
    w('Бежевая', 'cream', 'black'),
  ]),
];

/** Итоговый каталог: индекс, флаг «ноунейм», список применимых признаков. */
export const MODELS = RAW.map((m, i) => {
  const noname = ['Ноунейм', 'Глория', 'Зара'].includes(m.b);
  const catTells = CATS[m.cat].tells;
  // Признаки модели, ограниченные тем, что вообще применимо к категории.
  const tells = m.tells.filter((t) => catTells.includes(t));
  // Если у модели не задано — берём признаки категории.
  return {
    ...m,
    i,
    noname,
    tells: tells.length ? tells : noname ? [] : catTells.slice(0, 3),
    full: m.b + ' ' + m.n,
  };
});

export const BRANDED = MODELS.filter((m) => !m.noname);

export const BRANDS = [...new Set(BRANDED.map((m) => m.b))].sort((a, b) => a.localeCompare(b, 'ru'));

export const modelById = (i) => MODELS[i];

/** Модели, к которым применим этот признак. */
export const modelsWithTell = (tell) => BRANDED.filter((m) => m.tells.includes(tell));
