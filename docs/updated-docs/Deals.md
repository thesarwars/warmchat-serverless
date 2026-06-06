# **Deals Page Requirements**

The Deals page is where agents track real transaction opportunities after a lead becomes serious.

It should work like a simple transaction pipeline.

Agents can manually create and manage deals, and AI can also update deal stages based on conversations.

---

## **Main Metrics**

At the top show:

* Pipeline Value  
* Active Deals  
* Under Contract  
* Closed Won

These numbers should update from all deal cards.

---

## **Pipeline Tabs**

Deals should be separated by type:

* Sellers  
* Buyers  
* Renters

Each type has its own stages.

### **Seller Stages**

* Listing Consultation  
* Agreement Signed  
* Prepping Property  
* Active Listing  
* Offer Received  
* Under Contract  
* Escrow  
* Closed Won

### **Buyer Stages**

* Buyer Consultation  
* Home Search  
* Property Tours  
* Offer Writing  
* Offer Submitted  
* Under Contract  
* Escrow  
* Closed Won

### **Renter Stages**

* Renter Consultation  
* Property Search  
* Showings  
* Application Submitted  
* Screening  
* Approved  
* Lease Signed  
* Moved In

---

## **Deal Cards**

Agents should be able to add a deal inside any stage.

Each deal should include:

* Deal name or property address  
* Deal type: Buyer / Seller / Renter  
* Stage  
* Price  
* Estimated commission  
* Close date  
* Linked people/leads  
* Team member  
* Notes  
* Links/documents  
* Status

Agents should be able to drag and drop deals between stages.

---

## **AI Stage Updates**

AI should automatically update deal/lead stage when conversations show progress.

Examples:

* Lead asks for buyer consultation → Buyer Consultation  
* Lead is actively searching → Home Search  
* Lead requests showing → Property Tours  
* Lead wants to write offer → Offer Writing  
* Offer submitted → Offer Submitted  
* Contract signed → Under Contract  
* Escrow opened → Escrow  
* Deal closes → Closed Won

For sellers:

* Wants home value → Listing Consultation  
* Signs listing agreement → Agreement Signed  
* Preparing home → Prepping Property  
* Property goes live → Active Listing  
* Offer received → Offer Received  
* Contract signed → Under Contract  
* Escrow opened → Escrow  
* Closed → Closed Won

AI should not make major stage changes without confidence. If unsure, create a task or ask agent to confirm.

---

## **Listings Tab**

Listings are properties the AI can reference when talking to buyers.

Agents can add:

* Address  
* City/state/zip  
* Price  
* Listing type  
* Status  
* Bedrooms  
* Bathrooms  
* Square feet  
* Property type  
* Listing URL  
* Description  
* Photos

If “Visible to AI” is ON, AI can recommend that listing to matching buyers based on area, budget, beds, and property type.

---

## **Main Goal**

Deals page should help agents track where every serious opportunity is, what it is worth, and what needs to happen next.

AI helps keep the pipeline updated, but agents can always manually edit or move deals.

