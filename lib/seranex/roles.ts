/**
 * Seranex Team Roles & Permissions
 * 
 * Defines user roles for:
 * - Admin/Owners
 * - Staff (Junior/Senior Developers)
 * - Friends (Special "Bad Words" mode)
 * - Customers
 */

export const TEAM_ROLES = {
    OWNER: '94772148511', // You
    CO_OWNER: '94768290477', // Riyon (Senior Dev/Co-Owner)

    // Staff Members (Placeholders - update these when you have numbers)
    STAFF_WORDPRESS: '94774211801',
    STAFF_REACT: '94767000149',

    // External Partners
    STUDIO_VIBES: '94764152274', // Graphic Design
    SKY_DESIGNERS: '94778889490', // Marketing / Ads

    // Friends List (For "Bad Words" / Casual Mode)
    FRIENDS: [
        '94768290477', // Riyon is also a friend
        '94764152274',
        '94778889490',
        '94767000149',
        '94716191137',
        '94766191137',
        '94766191137',
        '94705163032',
        '94770221325',
        '94773833673',
        '94715778761',
        '94741134930',
        '94775965384',
        '94702916620',
        '94742943176',


    ],
    FAMILY: {
        MOM: '94774139621', // Add Mom's number here (e.g. '947...')
        DAD: '94775220563'  // Add Dad's number here
    }
};

export const CUSTOMER_TYPES = {
    LEAD: 'lead',             // New inquiry
    ACTIVE: 'active',         // Project in progress
    COMPLETED: 'completed',   // Past client (maintenance)
    FRIEND: 'friend',         // Close friend
    STAFF: 'staff',           // Employee
    FAMILY: 'family'          // Family members (Mom/Dad)
};

/**
 * Get user role based on phone number
 */
export function getUserRole(phone: string): { type: string, name: string } {
    // Clean phone number (remove + and spaces)
    const cleanPhone = phone.replace(/\D/g, '');

    if (cleanPhone === TEAM_ROLES.OWNER) return { type: CUSTOMER_TYPES.STAFF, name: 'Boss' };
    if (cleanPhone === TEAM_ROLES.CO_OWNER) return { type: CUSTOMER_TYPES.STAFF, name: 'Riyon (Co-Owner)' };
    if (cleanPhone === TEAM_ROLES.STAFF_WORDPRESS) return { type: CUSTOMER_TYPES.STAFF, name: 'WordPress Dev' };
    if (cleanPhone === TEAM_ROLES.STAFF_REACT) return { type: CUSTOMER_TYPES.STAFF, name: 'React Dev' };

    if (cleanPhone === TEAM_ROLES.FAMILY.MOM) return { type: CUSTOMER_TYPES.FAMILY, name: 'Amma' };
    if (cleanPhone === TEAM_ROLES.FAMILY.DAD) return { type: CUSTOMER_TYPES.FAMILY, name: 'Thaththa' };

    if (TEAM_ROLES.FRIENDS.includes(cleanPhone)) {
        return { type: CUSTOMER_TYPES.FRIEND, name: 'Friend' };
    }

    return { type: CUSTOMER_TYPES.LEAD, name: 'New Customer' }; // Default
}
