export const TOOLS = [
    {
        type: "function",
        function: {
            name: "check_stock",
            description: "Check if a specific auto part is available in the inventory.",
            parameters: {
                type: "object",
                properties: {
                    item_name: {
                        type: "string",
                        description: "The name of the part, e.g. 'Toyota Axio Brake Pads'",
                    },
                    vehicle_model: {
                        type: "string",
                        description: "The vehicle model if specified, e.g. 'Premio 260'",
                    }
                },
                required: ["item_name"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "place_order",
            description: "Place a new order for a customer after they have confirmed the item and price.",
            parameters: {
                type: "object",
                properties: {
                    items: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                name: { type: "string" },
                                quantity: { type: "number" }
                            }
                        }
                    },
                    delivery_address: {
                        type: "string",
                        description: "The delivery address provided by the customer.",
                    },
                    customer_name: {
                        type: "string",
                        description: "Name of the customer."
                    }
                },
                required: ["items", "delivery_address"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "escalate_to_human",
            description: "Trigger this if the user is angry, confused, or explicitly asks for a human.",
            parameters: {
                type: "object",
                properties: {
                    reason: {
                        type: "string",
                        description: "Why the human is needed.",
                    },
                },
                required: ["reason"],
            },
        },
    }
];
