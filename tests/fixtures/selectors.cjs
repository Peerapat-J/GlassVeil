module.exports = [
    { name: 'unique stable ID', html: '<div id="banner" data-target></div>', expected: '#banner' },
    ...['ad12345', 'abcdef1234', 'react-ad', 'vue-ad', 'ember-banner', 'ad_tmp'].map(id => ({
        name: `generated ID ${id}`, html: `<section id="stable"><div id="${id}" class="advert" data-target></div></section>`, expected: 'div.advert'
    })),
    { name: 'stable classes and temporary/generated classes', html: '<div class="advert slot glassveil-picker-selected glassveil-picker-hovered css_abc ad-123 ad12345 abcdefghijklmnopqrstuvwxyz" data-target></div>', expected: 'div.slot' },
    { name: 'escaped ID', html: '<div id="123:advert" data-target></div>', expected: '#\\31 23\\:advert' },
    { name: 'escaped classes', html: '<div class="ad:slot w/half" data-target></div>', expected: 'div.w\\/half' },
    { name: 'no ID or classes', html: '<main><article data-target></article></main>', expected: 'article' },
    { name: 'positional fallback counts same-type siblings', html: '<section id="root"><p></p><div class="ad"></div><span></span><div class="ad" data-target></div></section>', expected: 'div:nth-of-type(2)' },
    { name: 'duplicate ID uses a positional path', html: '<div id="duplicate"></div><div id="duplicate" data-target></div>', expected: 'div:nth-of-type(2)' },
    { name: 'stable attributes beat bare tags', html: '<div data-testid="banner" aria-label="Advertisement" data-target></div>', expected: 'div[data-testid=banner]' },
    { name: 'leading/trailing spaces in ID do not invent a match', html: '<div id=" banner " class="ad" data-target></div>', expected: '#\\ banner\\ ' }
];
