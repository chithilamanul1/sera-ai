/**
 * Smart Title/Gender Detection for WhatsApp
 * Detects gender from name and suggests appropriate title
 * 
 * Rules:
 * - Business names → "sir" (formal)
 * - Male names → "sir"
 * - Female names → "miss"
 * - Frequent customers → "aiye" (male) or "akke" (female)
 */

// Common Sri Lankan male names
const MALE_NAMES = new Set([
    // Sinhala male names
    'kamal', 'nimal', 'sunil', 'anil', 'chaminda', 'nuwan', 'kasun', 'lahiru',
    'saman', 'ruwan', 'tharanga', 'dilshan', 'chamara', 'janaka', 'pradeep',
    'lakmal', 'asanka', 'thisara', 'charith', 'dinesh', 'mahesh', 'rajitha',
    'sanjeewa', 'sampath', 'thilak', 'ajith', 'roshan', 'damith', 'prasanna',
    'buddhika', 'hasitha', 'isuru', 'kavinda', 'malith', 'nipuna', 'pathum',
    'ravindra', 'sajith', 'tharindu', 'udara', 'viraj', 'yasith', 'nadun',
    'riyon', 'nisal', 'supun', 'osanda', 'hirantha', 'dhanushka', 'ashen',

    // Tamil male names
    'kumar', 'raj', 'vijay', 'siva', 'ganesh', 'ramesh', 'suresh', 'rajesh',
    'prakash', 'mohan', 'ravi', 'arun', 'karthik', 'vignesh', 'naveen',

    // Muslim male names
    'mohamed', 'ahmed', 'fawzan', 'rizwan', 'imran', 'farhan', 'irfan',
    'faiz', 'rafiq', 'shameer', 'ashik', 'saheel', 'fayaz', 'nazeer',

    // Common English names
    'john', 'david', 'michael', 'james', 'robert', 'chris', 'daniel', 'andrew',
    'peter', 'mark', 'paul', 'kevin', 'brian', 'steve', 'alex', 'jason'
]);

// Common Sri Lankan female names
const FEMALE_NAMES = new Set([
    // Sinhala female names
    'kumari', 'chamari', 'dilhani', 'sanduni', 'hashini', 'anusha', 'nisha',
    'kavitha', 'malini', 'deepika', 'iresha', 'gayani', 'sachini', 'menaka',
    'shanika', 'nilmini', 'tharushi', 'hiruni', 'sewwandi', 'dilini', 'sachithra',
    'buddhini', 'ishara', 'madushi', 'nipuni', 'rashmi', 'shashikala', 'thilini',
    'uthpala', 'vidusha', 'yashodha', 'nadeesha', 'chathurika', 'dinesha',
    'geethika', 'harshani', 'jayani', 'kishani', 'lakshika', 'manisha',

    // Tamil female names
    'priya', 'lakshmi', 'devi', 'geetha', 'mala', 'rani', 'vani', 'padma',
    'shanthi', 'saroja', 'vasuki', 'meena', 'indra', 'ramya', 'kavya',

    // Muslim female names
    'fathima', 'ayesha', 'zainab', 'mariam', 'safiya', 'nafisa', 'shahana',
    'rizna', 'fareeda', 'salma', 'hasna', 'samra', 'shifa', 'suhana',

    // Common English names
    'mary', 'sarah', 'emma', 'anna', 'lisa', 'julia', 'kate', 'jessica',
    'jennifer', 'michelle', 'amanda', 'stephanie', 'nicole', 'ashley', 'emily'
]);

// Business indicators in name
const BUSINESS_INDICATORS = [
    'tours', 'taxi', 'travels', 'hotel', 'restaurant', 'shop', 'store',
    'company', 'pvt', 'ltd', 'enterprises', 'traders', 'motors', 'electronics',
    'agency', 'services', 'solutions', 'lanka', 'ceylon', 'colombo', 'sri',
    'international', 'group', 'holdings', 'industries', 'exports', 'imports',
    'fashion', 'beauty', 'salon', 'academy', 'institute', 'center', 'centre',
    'airport', 'booking', 'rentals', 'cabs', 'express', 'delivery'
];

export interface TitleInfo {
    title: string;           // "sir", "miss", "aiye", "akke"
    gender: 'male' | 'female' | 'unknown';
    isBusiness: boolean;
    isFrequent: boolean;
}

/**
 * Detect title/gender from WhatsApp name
 */
export function detectTitle(
    displayName: string,
    isFrequentCustomer: boolean = false
): TitleInfo {
    const nameLower = displayName.toLowerCase().trim();
    const words = nameLower.split(/[\s\-_\.]+/);
    const firstName = words[0] || '';

    // Check if it's a business name
    const isBusiness = BUSINESS_INDICATORS.some(indicator =>
        nameLower.includes(indicator)
    );

    if (isBusiness) {
        return {
            title: 'sir',
            gender: 'unknown',
            isBusiness: true,
            isFrequent: isFrequentCustomer
        };
    }

    // Check male names
    if (MALE_NAMES.has(firstName)) {
        return {
            title: isFrequentCustomer ? 'aiye' : 'sir',
            gender: 'male',
            isBusiness: false,
            isFrequent: isFrequentCustomer
        };
    }

    // Check female names
    if (FEMALE_NAMES.has(firstName)) {
        return {
            title: isFrequentCustomer ? 'akke' : 'miss',
            gender: 'female',
            isBusiness: false,
            isFrequent: isFrequentCustomer
        };
    }

    // Try to guess from name endings (Sinhala patterns)
    if (firstName.endsWith('a') || firstName.endsWith('i') || firstName.endsWith('ni') || firstName.endsWith('shi')) {
        // Likely female
        return {
            title: isFrequentCustomer ? 'akke' : 'miss',
            gender: 'female',
            isBusiness: false,
            isFrequent: isFrequentCustomer
        };
    }

    // Default to sir for unknown
    return {
        title: isFrequentCustomer ? 'aiye' : 'sir',
        gender: 'unknown',
        isBusiness: false,
        isFrequent: isFrequentCustomer
    };
}

/**
 * Get greeting with title
 */
export function getGreetingWithTitle(displayName: string, isFrequent: boolean = false): string {
    const info = detectTitle(displayName, isFrequent);

    if (info.isBusiness) {
        return `Hello ${info.title}! Kohomada business eka? 😊`;
    }

    if (isFrequent) {
        return info.gender === 'female'
            ? `Hari ${info.title}! Kohomada? 😊`
            : `Hari ${info.title}! Kohomada? 😊`;
    }

    return info.gender === 'female'
        ? `Hello ${info.title}! Kohomada udaw karanne? 😊`
        : `Hello ${info.title}! Kohomada udaw karanne? 😊`;
}

export default detectTitle;
