const Slovar: Record<string, string[]> = {
    'diary': [ 'diary', 'дневник' ],
    'art-title' : [ 'Article title', 'Заголовок статьи'],
    'untitled' : ['Untitled', 'Без названия'],
    'threads' : ["Threads", "Треды"],
    'articles' : ["Articles", "Статьи"],
    'celendar' : ["Celendar", "Календарь"]


}

const lang = navigator.language.split('-')[0];

export function rep(str: string): string {
    switch (lang){
        case 'ru':
            return Slovar[str][1];
        case 'en':
            return Slovar[str][0];
    }
    return str;
}

