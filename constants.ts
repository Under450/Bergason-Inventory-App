
import { Condition, Cleanliness } from "./types";

export const HS_QUESTIONS = [
  "Do all floors have smoke/heat alarms present?",
  "Do all smoke/heat alarms have working test buttons?",
  "Are any areas requiring a smoke/heat alarm missing an installed unit?",
  "Are carbon monoxide alarms present in rooms with a fuel burning source (excluding gas cooking appliances) or flue?",
  "Do all carbon monoxide alarms have working test buttons?",
  "Are any areas requiring a carbon monoxide alarm missing an installed unit?"
];

// Organized by section headers as requested
export const PREDEFINED_ROOMS = [
  { group: "EXTERNAL", names: ["Front Garden", "Porch", "Meter Cupboard", "Outbuilding / Shed", "Garage", "Rear Garden", "Miscellaneous (External)"] },
  { group: "GROUND FLOOR", names: ["Hallway", "Living Room", "Dining Room", "Kitchen", "WC (Downstairs Cloaks)", "Study", "Storage Cupboard", "Miscellaneous (Ground Floor)"] },
  { group: "STAIRS & LANDING", names: ["Stairs", "Landing", "Airing Cupboard"] },
  { group: "FIRST FLOOR", names: ["Bedroom 1", "Bedroom 2", "Bedroom 3", "Bedroom 4", "Bedroom 5", "En-Suite", "Bathroom", "Miscellaneous (First Floor)"] },
  { group: "OTHER", names: ["Loft", "Additional external areas (if any)"] }
];

export const DEFAULT_ITEMS = [
  "General Overview",
  "Door & Frame",
  "Ceiling",
  "Walls",
  "Flooring",
  "Windows & Sills",
  "Lighting",
  "Heating",
  "Sockets & Switches",
  "Skirting Boards",
  "Curtains/Blinds",
  "Furniture"
];

export const METER_ITEMS = [
    "Gas Meter",
    "Electric Meter",
    "Water Meter",
    "General Overview"
];

export const KITCHEN_ITEMS = [
    // Work Areas
    "Worktops",
    "Splashbacks",
    "Wall tiles",
    "Paintwork",
    "Sealant (sink, worktop edges, tiles)",
    // Storage
    "Kitchen cabinets (upper)",
    "Kitchen cabinets (lower)",
    "Cabinet interiors",
    "Drawers",
    "Cupboard doors",
    "Cabinet handles/hinges",
    // Plumbing
    "Sink",
    "Taps",
    "Plug/strainer",
    "Waste disposal unit",
    "Pipework visible",
    "Stop tap position",
    // Major Appliances
    "Oven",
    "Grill",
    "Hob",
    "Extractor hood",
    "Microwave",
    "Dishwasher",
    "Washing machine",
    "Tumble dryer",
    "Washer/dryer combo",
    "Fridge",
    "Freezer",
    "Fridge-freezer",
    "Boiler",
    // Small Appliances
    "Kettle",
    "Toaster",
    "Coffee machine",
    "Blender / mixer",
    "Iron",
    "Other small appliances",
    // Fixtures
    "Smoke alarm",
    "Heat alarm",
    "Carbon monoxide alarm",
    "Fire blanket",
    "Fire extinguisher",
    "Thermostat",
    // Contents
    "Plates",
    "Bowls",
    "Glasses",
    "Mugs",
    "Cutlery",
    "Utensils",
    "Pots/pans",
    "Chopping boards",
    "Dish rack",
    "Bins",
    "Bin liners",
    // Security
    "Window locks"
];

export const MAJOR_APPLIANCES = [
    "Oven", "Grill", "Hob", "Extractor hood", "Microwave", "Dishwasher", 
    "Washing machine", "Tumble dryer", "Washer/dryer combo", "Fridge", 
    "Freezer", "Fridge-freezer", "Boiler"
];

export const REQUIRED_DOCUMENTS_LIST = [
    "Energy Performance Certificate",
    "Gas Safety Certificate",
    "Electrical Safety Certificate",
    "Bergason Terms & Conditions",
    "Deposit Protection Scheme Terms & Conditions",
    "Deposit Protection Scheme Prescribed Information",
    "How To Rent Leaflet",
    "Legionnaires Information",
    "Miscellaneous"
];

export const CONDITION_COLORS: Record<Condition, string> = {
  [Condition.EXCELLENT]: "bg-green-600 text-white border-green-700",
  [Condition.GOOD]: "bg-green-100 text-green-800 border-green-200",
  [Condition.FAIR]: "bg-yellow-100 text-yellow-800 border-yellow-200",
  [Condition.POOR]: "bg-orange-100 text-orange-800 border-orange-200",
  [Condition.NEEDS_ATTENTION]: "bg-red-600 text-white border-red-700"
};

export const CLEANLINESS_COLORS: Record<Cleanliness, string> = {
  [Cleanliness.PROFESSIONAL]: "bg-green-600 text-white border-green-700",
  [Cleanliness.DOMESTIC]: "bg-blue-100 text-blue-800 border-blue-200",
  [Cleanliness.GOOD]: "bg-green-100 text-green-800 border-green-200",
  [Cleanliness.FAIR]: "bg-yellow-100 text-yellow-800 border-yellow-200",
  [Cleanliness.POOR]: "bg-orange-100 text-orange-800 border-orange-200",
  [Cleanliness.DIRTY]: "bg-red-600 text-white border-red-700"
};

export const DISCLAIMER_TEXT = `The term ‘Inspector’ is used hereafter to define the Bergason Inventory user that is responsible for completing this property report. It is the duty and ultimate responsibility of the Inspector and Tenant to agree upon the accuracy of this report.

This report has been prepared by an inspector who is not an expert in buildings, furnishings, decorations, woods, antiques or a qualified surveyor. This report relates only to the furniture and all the landlord’s equipment and contents in the property. It is no guarantee, or report on, the adequacy of, or safety of, any such equipment or contents, merely a record that such items exist in the property at the date of preparing the report and the superficial condition of same.

The inspector will not take water readings unless the meter is clearly visible within the property or attached to an exterior wall at low accessible level. Windows throughout the property have not been tested for function or operation. Descriptions are purely based on the superficial appearance of windows, frames and locks. The inspector can accept no liability arising from any failure of the windows or parts thereof to function properly at all.

Inspectors do not check gas or electrical appliances and give no guarantee with regard to the safety or reliability of such items. It should be noted that inspectors are not required to inspect smoke or carbon monoxide alarms, testing such alarm ‘test functions’ may occur. However, this is no guarantee, or report on, the adequacy of these alarms. It is merely a record that batteries were present (if tested) upon completion of this report.

The inspector cannot undertake to move heavy items of furniture or to make searches in inaccessible locations such as loft spaces, cellars, locked rooms and high level cupboards, or to unpack items. Inspectors reserve the right not to handle or move items deemed to be fragile or valuable. In addition, the inspectors reserve the right not to handle items that may be of a health hazard and to generalise/summarise on such items deemed to be unsuitable for further inspection.

Furniture and furnishings (Fire) Safety Regulations 1988 – (1993)
The fire and safety regulation regarding furnishings, gas, electrical and similar services are ultimately the responsibility of the instructing principle. Where the report notes “Fire Label Present”, this should not be interpreted to mean the item complies with the “furniture and furnishings (fire) (safety) (amendments) 1993”. It is a record that the item had a label as described or similar to that detailed in the “guide” published by the Department of Trade and Industry January 1997 (or subsequent date). It is not a statement that the item can be considered to comply with the regulations.

Safety Certificate and Legislation Compliance
The safety certificate and legislation compliance checklists in this report are no guarantee, or report on, the adequacy of, or safety of, any such liability contents, merely a record that such steps have been offered by the Bergason Inventory to highlight issues that may exist at the property at the date of preparing this report. Bergason Inventory accepts no responsibility for the contents of these steps. It is the responsibility of the Tenant to agree upon the accuracy of these steps.

Health & Safety / Insurance Risk-Avoidance Steps
The safety certificate and legislation compliance checklists in this report are no guarantee, or report on, the adequacy of, or safety of, any such liability contents, merely a record that such steps have been offered by the Bergason Inventory to highlight issues that may exist at the property at the date of preparing this report. Bergason Inventory accepts no responsibility for the contents of these steps. It is the responsibility of the Tenant to agree upon the accuracy of these steps.`;

export const GUIDANCE_NOTES = `What should I know about the check-out process?
At the beginning of the tenancy it is important to note any specific discrepancies on the report that you do not agree with i.e marks on walls, carpets, etc. If no such additional notes are made via the electronic process at the start of the tenancy, the report will be deemed as accepted as read.
The condition of the property at the start of the tenancy, as described in the report will be compared to the condition of the property at the end of tenancy. Details of any alterations to the property after the report has been agreed upon will be recorded by the inspector (Bergason).
A ‘Check-Out’ report may be conducted to determine any changes to the report. The tenant should gain permission from the managing agent/landlord if they wish to remove or store any items during the tenancy and this should be confirmed in writing by the managing agent/landlord.
The inspector cannot undertake to move heavy items of furniture or to make searches in inaccessible locations such as loft spaces, cellars, locked rooms and high level cupboards, or to unpack items. Inspectors reserve the right not to handle or move items deemed to be fragile or valuable. In addition, the inspector reserves the right not to handle items that may be of a health hazard and to generalise/summarise on such items deemed to be unsuitable for further inspection.

What should I know before the check-out report is created?
All items should be returned to their original position (as detailed on the report); this includes stored or boxed items not used during the tenancy. Any items listed as ‘Item Missing’ can often result in a replacement cost or a charge being made. Managing agents/landlords may also charge for the removal of unapproved items left by a tenant at the end of the tenancy that were not included in the original report.
At the time of the property ‘Check-Out’ all personal items (including consumable items) should have been removed and cleaning of the property completed. Generally, no further cleaning is permitted once the ‘Check-Out’ inspection has commenced. Tenants should be advised of the date and time of the ‘Check-Out’ and provide access, or let the appointed inspector know the details of their departure of the property.
Additional costs are sometimes charged by managing agents/landlords if the inspector is not able to complete the ‘Check-Out’ inspection due to the tenant not being ready to vacate or if they are delayed.
The ‘Check-Out’ report is advisory and is based on information available to the inspector at the time of the ‘Check-Out’. It must not be treated as a final statement of tenant responsibility. It remains the responsibility of the agent/landlord and tenant to fully agree any issues and/or deductions (if any) from the deposit.

Issues to look out for during the tenancy…

Cleaning
Soiling is not considered to be ‘Fair wear & Tear’, (as defined by the House of Lords as ‘reasonable use of the premises by the tenant and the ordinary operation of natural forces, i.e; the passage of time). Generally speaking, tenants are liable for the property to be cleaned to the same standard as detailed in the report at the start of the tenancy.

Soft Furnishings
Excessive discolouring which cannot be attributed to sun bleaching and/or the passage of time, soiling or damage may result in repair or cleaning costs being charged to tenants. Discolouration due to smoke, staining, burns or tears to curtains may also incur costs.

Flooring
Hard floors require sweeping and mopping where necessary (in accordance with any specialist cleaning materials/advice provided by the managing agent/landlord). Tenants are often charged by the managing agent/landlord for repairs or replacement costs due to soiling, staining or damage such as cigarette or iron burns.

Decoration
As specified in the majority of tenancy agreements, tenants should gain signed, written permission (keep a copy) from the managing agent/landlord prior to putting nails, pins and other fixtures into walls and ceilings and should avoid the use of tac or tape. Additional marks/fittings are often noted at the ‘Check-Out’ and any damage or repair work required is often charged to tenants by managing agents/landlords.

Beds & Linen
Mattresses, divan bases, pillows, and duvets are often inspected for soiling where practically possible. Costs may be incurred by tenants for clearing, compensation or a percentage of the replacement charge by the managing agent/landlord in the event that any such items are soiled beyond that noted to the report. Beds should not be made up at the time of the ‘Check-Out’ inspection and any linen should be left clean, pressed and folded.

Kitchen Surfaces and Sinks
Kitchen surfaces and sinks are often inspected for knife cuts, cup marks, scorch and burn damage. Using appropriate items such as chopping boards and heat pads will help prevent damage.

Crockery, Chinaware, Kitchen Utensils
These items are often checked for soiling, chips and damage. If damage has occurred that is not considered as consistent with ‘fair wear and tear’, compensation or replacement costs may be incurred by the tenant.

Keys
All keys listed in the report should be kept safe and handed back at the ‘Check-Out’. When keys get lost or are not returned to the managing agent, landlord or inspector, tenants are often charged for replacement keys or possibly for the changing of locks. Any additional keys cut during the tenancy should also be returned to the agent.

Gardens & Exterior Areas
Most tenancy agreements state that the tenant is responsible for the maintenance of gardens and exterior areas such as driveways unless agreed in writing otherwise. This includes the cutting of lawns, weeding and maintaining the garden, paths, driveways, flowerbeds etc according to the season. If the standard is found to be below the condition as detailed to the report, (with consideration given for a change in season) tenants are often charged for necessary work to bring the affected area back the required level.`;

export const DECLARATION_TEXT = `I hereby confirm approval of the accuracy and contents of the information contained within this report and my responses (if/where provided). I have also read, understood and agree to the disclaimer information contained within this report. I hereby confirm that the test function button of any smoke and carbon monoxide alarms (where present) in my property are/were in working order (alarm sounds when pressed) at the start of my tenancy. I also understand that it is my responsibility to ensure that any smoke or carbon monoxide alarms are tested and batteries replaced (where required) during my tenancy. Furthermore, in the event any such alarm becomes faulty, I will inform my landlord or managing agent with immediate effect to arrange a replacement.`;
