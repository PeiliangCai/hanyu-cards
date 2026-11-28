import type { SavedMissionPractice } from '@/types/learning'

export const savedMissionPractices = {
    firstMeeting: {
        title: 'Forms of address',
        chineseTitle: '称呼',
        searchTerms: ['address', 'surname', 'teacher', '称呼', '稱呼', '贵姓', '貴姓'],
        cultureNote: 'At a school, a family name followed by 老师 is a common way to address a teacher. 您 sounds polite when you first meet. When you are unsure, ask how the person would like to be addressed.',
        expressions: [
            { zh: '请问，您贵姓？', pinyin: 'Qǐngwèn, nín guìxìng?', en: 'May I ask your surname?' },
            { zh: '我可以叫您李老师吗？', pinyin: 'Wǒ kěyǐ jiào nín Lǐ lǎoshī ma?', en: 'May I call you Teacher Li?' },
        ],
        goal: 'A teacher introduces herself at the welcome desk. Ask if you can call her Teacher Li.',
        openingLine: { speaker: 'Teacher', zh: '你好！我姓李。', pinyin: 'Nǐ hǎo! Wǒ xìng Lǐ.', en: 'Hello! My surname is Li.' },
        modelReply: { zh: '您好！我可以叫您李老师吗？', pinyin: 'Nín hǎo! Wǒ kěyǐ jiào nín Lǐ lǎoshī ma?', en: 'Hello! May I call you Teacher Li?' },
    },
    orderAMeal: {
        title: 'Asking for less spice',
        chineseTitle: '少放辣',
        searchTerms: ['spice', 'spicy', 'chili', '辣'],
        cultureNote: 'It helps to ask about spice before the kitchen starts cooking. Some restaurants can adjust chili when cooking to order, and some dishes have a prepared sauce. Ask which dishes are mild if the kitchen cannot change your first choice.',
        expressions: [
            { zh: '可以少放一点儿辣椒吗？', pinyin: 'Kěyǐ shǎo fàng yìdiǎnr làjiāo ma?', en: 'Could you add a little less chili?' },
            { zh: '有不辣的吗？', pinyin: 'Yǒu bù là de ma?', en: 'Is there a mild option?' },
        ],
        goal: 'Order one bowl of noodles and ask for less chili.',
        openingLine: { speaker: 'Server', zh: '这个面有点儿辣。', pinyin: 'Zhège miàn yǒudiǎnr là.', en: 'These noodles are a little spicy.' },
        modelReply: { zh: '我想要一碗面，可以少放一点儿辣椒吗？', pinyin: 'Wǒ xiǎng yào yì wǎn miàn, kěyǐ shǎo fàng yìdiǎnr làjiāo ma?', en: 'I would like a bowl of noodles. Could you add a little less chili?' },
    },
    buyClothes: {
        title: 'Bargaining',
        chineseTitle: '砍价',
        searchTerms: ['bargain', 'haggle', 'haggling', 'negotiate', 'negotiating', 'lower price', '砍价', '砍價', '讲价', '講價', '讨价还价', '討價還價'],
        cultureNote: 'At some street markets, a stallholder may be open to a counteroffer. Marked prices in malls and chain stores are usually fixed. Start by asking if the seller can lower the price, make a polite offer, and accept the seller’s answer.',
        expressions: [
            { zh: '能便宜一点吗？', pinyin: 'Néng piányi yìdiǎn ma?', en: 'Could it be a little cheaper?' },
            { zh: '八十块可以吗？', pinyin: 'Bāshí kuài kěyǐ ma?', en: 'Would 80 yuan work?' },
        ],
        goal: 'At a market stall, a seller asks for 100 yuan for a jacket. Ask if they can go lower and offer 80 yuan politely.',
        openingLine: { speaker: 'Seller', zh: '这件外套一百块。', pinyin: 'Zhè jiàn wàitào yì bǎi kuài.', en: 'This jacket is 100 yuan.' },
        modelReply: { zh: '能便宜一点吗？八十块可以吗？', pinyin: 'Néng piányi yìdiǎn ma? Bāshí kuài kěyǐ ma?', en: 'Could it be a little cheaper? Would 80 yuan work?' },
    },
    takeTheMetro: {
        title: 'Transfer directions',
        chineseTitle: '换乘',
        searchTerms: ['transfer', 'change lines', '换乘', '換乘'],
        cultureNote: 'Metro transfer signs often show 换乘 and the line number. Check the terminal station next to 开往 (bound for) to choose the right direction. You can confirm the line and direction with station staff.',
        expressions: [
            { zh: '请问，在哪一站换乘二号线？', pinyin: 'Qǐngwèn, zài nǎ yí zhàn huànchéng Èr Hào Xiàn?', en: 'Excuse me, at which stop do I change to Line 2?' },
            { zh: '我应该往哪个方向走？', pinyin: 'Wǒ yīnggāi wǎng nǎge fāngxiàng zǒu?', en: 'Which way should I go?' },
        ],
        goal: 'Tell the attendant you want to go to the museum and ask where to transfer to Line 2.',
        openingLine: { speaker: 'Attendant', zh: '你好，你想去哪儿？', pinyin: 'Nǐ hǎo, nǐ xiǎng qù nǎr?', en: 'Hello, where would you like to go?' },
        modelReply: { zh: '我想去博物馆。请问，在哪一站换乘二号线？', pinyin: 'Wǒ xiǎng qù bówùguǎn. Qǐngwèn, zài nǎ yí zhàn huànchéng Èr Hào Xiàn?', en: 'I want to go to the museum. Excuse me, at which stop do I change to Line 2?' },
    },
    campusProject: {
        title: 'Rescheduling',
        chineseTitle: '改时间',
        searchTerms: ['reschedul', 'change the time', 'change time', '改时间', '改時間'],
        cultureNote: 'In a group project, 不好意思 is a common way to acknowledge a change of plans. Offering a specific alternative helps teammates decide. Confirm the day and time once everyone agrees.',
        expressions: [
            { zh: '不好意思，周三我有事。', pinyin: 'Bù hǎoyìsi, Zhōusān wǒ yǒu shì.', en: 'Sorry, I have something on Wednesday.' },
            { zh: '我们改到周四下午三点，可以吗？', pinyin: 'Wǒmen gǎi dào Zhōusì xiàwǔ sān diǎn, kěyǐ ma?', en: 'Could we move it to Thursday at three in the afternoon?' },
        ],
        goal: 'Tell your teammate you are busy on Wednesday and suggest Thursday at 3 p.m.',
        openingLine: { speaker: 'Teammate', zh: '我们周三下午见面吧。', pinyin: 'Wǒmen Zhōusān xiàwǔ jiànmiàn ba.', en: 'Let’s meet Wednesday afternoon.' },
        modelReply: { zh: '不好意思，周三我有事。我们改到周四下午三点，可以吗？', pinyin: 'Bù hǎoyìsi, Zhōusān wǒ yǒu shì. Wǒmen gǎi dào Zhōusì xiàwǔ sān diǎn, kěyǐ ma?', en: 'Sorry, I have something on Wednesday. Could we move it to Thursday at three?' },
    },
    visitAClinic: {
        title: 'Asking someone to repeat',
        chineseTitle: '请再说一遍',
        searchTerms: ['repeat', 'speak slower', 'say it again', '再说', '再說', '慢一点', '慢一點'],
        cultureNote: 'At a busy clinic, a receptionist may give several details quickly. Ask politely for the part you missed, such as a floor or room number. Repeating the number back is a way to confirm you heard correctly.',
        expressions: [
            { zh: '不好意思，您能再说一遍吗？', pinyin: 'Bù hǎoyìsi, nín néng zài shuō yí biàn ma?', en: 'Excuse me, could you say that again?' },
            { zh: '您可以说慢一点吗？', pinyin: 'Nín kěyǐ shuō màn yìdiǎn ma?', en: 'Could you speak a little more slowly?' },
        ],
        goal: 'You missed the room number. Ask the receptionist to repeat it.',
        openingLine: { speaker: 'Receptionist', zh: '请您去二楼的三号诊室。', pinyin: 'Qǐng nín qù èr lóu de sān hào zhěnshì.', en: 'Please go to room 3 on the second floor.' },
        modelReply: { zh: '不好意思，您能再说一遍吗？请问是几号诊室？', pinyin: 'Bù hǎoyìsi, nín néng zài shuō yí biàn ma? Qǐngwèn shì jǐ hào zhěnshì?', en: 'Excuse me, could you say that again? Which room is it?' },
    },
} satisfies Record<string, SavedMissionPractice>
