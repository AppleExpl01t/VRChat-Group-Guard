// ToS content stored as structured JSON for easier UI rendering
export const CURRENT_TOS_VERSION = "1.0.0";
export const TOS_LAST_UPDATED = "February 1, 2026";

export interface TosSection {
  id: string;
  title: string;
  icon: 'shield' | 'warning' | 'database' | 'user-x' | 'scale' | 'ban' | 'lock' | 'credit-card' | 'alert' | 'link';
  variant?: 'default' | 'warning' | 'danger';
  content: TosContent[];
}

export type TosContent = 
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[]; ordered?: boolean }
  | { type: 'highlight'; text: string; variant: 'info' | 'warning' | 'danger' }
  | { type: 'subsection'; title: string; content: TosContent[] };

export const TOS_SECTIONS: TosSection[] = [
  {
    id: 'warranty',
    title: '1. Disclaimer of Warranty',
    icon: 'alert',
    content: [
      { 
        type: 'paragraph', 
        text: 'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NONINFRINGEMENT.' 
      },
      { 
        type: 'paragraph', 
        text: 'In no event shall the authors or copyright holders be liable for any claim, damages, or other liability, whether in an action of contract, tort, or otherwise, arising from, out of, or in connection with the software.' 
      }
    ]
  },
  {
    id: 'liability',
    title: '2. Limitation of Liability',
    icon: 'warning',
    variant: 'warning',
    content: [
      { type: 'highlight', text: 'YOU ACKNOWLEDGE AND AGREE THAT:', variant: 'warning' },
      {
        type: 'list',
        ordered: true,
        items: [
          '**Risk of Ban:** The use of third-party automation tools with VRChat or other platforms carries an inherent risk of account restriction, suspension, or termination.',
          '**No Liability:** The developers, contributors, and administrators of Group Guard For VRChat **SHALL NOT BE HELD LIABLE** for any actions taken against your accounts.',
          '**Use at Own Risk:** You use this Software entirely at your own risk.'
        ]
      }
    ]
  },
  {
    id: 'data',
    title: '3. Data Collection & Privacy',
    icon: 'database',
    content: [
      { type: 'paragraph', text: 'By using the Software, you consent to the collection of:' },
      {
        type: 'list',
        items: [
          '**Hardware ID (HWID):** Used to prevent ban evasion and enforce access controls',
          '**IP Address:** Logged for security auditing and abuse prevention',
          '**VRChat Identity:** User ID and Display Name for usage history',
          '**Usage Data:** Timestamps of logins and feature usage'
        ]
      },
      { type: 'paragraph', text: 'This data is stored securely and is NOT shared with VRChat Inc. or other third parties unless required by law.' }
    ]
  },
  {
    id: 'acceptable-use',
    title: '4. Acceptable Use Policy',
    icon: 'user-x',
    content: [
      { type: 'paragraph', text: 'You agree NOT to use the Software to:' },
      {
        type: 'list',
        items: [
          'Harass, stalk, or harm other users',
          'Violate the Terms of Service of VRChat or any other platform',
          'Reverse engineer, decompile, or modify the Software to bypass security',
          'Distribute modified or malicious versions of the Software'
        ]
      }
    ]
  },
  {
    id: 'indemnification',
    title: '5. Indemnification',
    icon: 'scale',
    content: [
      { 
        type: 'paragraph', 
        text: 'You agree to indemnify, defend, and hold harmless the developers and administrators of Group Guard For VRChat from and against any and all claims, liabilities, damages, and costs (including legal fees) arising out of your use of the Software or your violation of these Terms.' 
      }
    ]
  },
  {
    id: 'termination',
    title: '6. Termination',
    icon: 'ban',
    variant: 'danger',
    content: [
      { 
        type: 'paragraph', 
        text: 'We reserve the right to revoke your access to the Software at any time, for any reason, without notice. Reasons for termination may include violation of the Acceptable Use Policy, chargebacks, or attempts to bypass licensing restrictions.' 
      }
    ]
  },
  {
    id: 'severability',
    title: '7. Severability',
    icon: 'lock',
    content: [
      { 
        type: 'paragraph', 
        text: 'If any provision of these Terms is found to be unenforceable or invalid, that provision will be limited or eliminated to the minimum extent necessary, so that these Terms will otherwise remain in full force and effect.' 
      }
    ]
  },
  {
    id: 'payments',
    title: '8. Fees, Payments, and Refunds',
    icon: 'credit-card',
    variant: 'danger',
    content: [
      {
        type: 'subsection',
        title: '8.1 Subscription and Payments',
        content: [
          { type: 'paragraph', text: 'Access to certain features may require a one-time payment or recurring subscription fee. By providing a payment method, you authorize us to charge the designated fees.' }
        ]
      },
      {
        type: 'subsection',
        title: '8.2 Strict No-Refund Policy',
        content: [
          { 
            type: 'highlight', 
            variant: 'danger',
            text: 'ALL SALES ARE FINAL. No refunds for bans, termination, or any other reason.'
          },
          {
            type: 'list',
            items: [
              '**Digital Goods:** Immediate access upon purchase means all sales are final',
              '**No Refunds for Bans:** No refunds if your accounts are restricted or banned',
              '**No Refunds for Termination:** No refunds if access is revoked for ToS violations'
            ]
          }
        ]
      },
      {
        type: 'subsection',
        title: '8.3 Chargebacks and Disputes',
        content: [
          { type: 'paragraph', text: 'You agree to contact support to resolve billing issues before initiating a chargeback.' },
          { type: 'highlight', variant: 'danger', text: 'Chargebacks without contacting support first may result in permanent termination and ban of your HWID and VRChat Identity.' }
        ]
      }
    ]
  }
];

export const TOS_GITHUB_URL = 'https://github.com/AppleExpl01t/Group-Guard-for-VRChat';

// Keep the old text for backward compatibility or other uses
export const TOS_TEXT = `
# Group Guard For VRChat Terms of Service

**Last Updated:** February 1, 2026

**IMPORTANT: PLEASE READ CAREFULLY.**
BY CLICKING "I AGREE", DOWNLOADING, OR USING "GROUP GUARD FOR VRCHAT" ("THE SOFTWARE"), YOU AGREE TO BE BOUND BY THESE TERMS. IF YOU DO NOT AGREE, DO NOT USE THE SOFTWARE.

**OFFICIAL SOURCE:** The only official source for this Software is the GitHub repository located at:
[https://github.com/AppleExpl01t/Group-Guard-for-VRChat](https://github.com/AppleExpl01t/Group-Guard-for-VRChat)
We are not responsible for any versions of the Software obtained from other sources.

## 1. Disclaimer of Warranty ("As Is")

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES, OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT, OR OTHERWISE, ARISING FROM, OUT OF, OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## 2. Limitation of Liability & Third-Party Accounts

**YOU ACKNOWLEDGE AND AGREE THAT:**

1.  **Risk of Ban:** The use of third-party automation tools with VRChat or other platforms carries an inherent risk of account restriction, suspension, or termination ("Ban").
2.  **No Liability:** The developers, contributors, and administrators of Group Guard For VRChat **SHALL NOT BE HELD LIABLE** for any actions taken against your VRChat account, Steam account, or any other third-party service account resulting from the use of this Software.
3.  **Use at Own Risk:** You use this Software entirely at your own risk.

## 3. Data Collection & Privacy Policy

By using the Software, you consent to the collection and processing of the following data for security, analytics, and license enforcement purposes:

1.  **Hardware ID (HWID):** A unique identifier derived from your computer's hardware components. Used to prevent ban evasion and enforce access controls.
2.  **IP Address:** Your internet protocol address. Logged for security auditing and to prevent abuse.
3.  **VRChat Identity:** Your VRChat User ID (e.g., \`usr_xxxxx\`) and Display Name. Used to associate your usage history and enforce bans within the Software.
4.  **Usage Data:** Timestamps of when you log in or use specific features.

This data is stored securely and is accessible only to the Administrators of the Group Guard For VRChat instance you are connecting to. It is **NOT** shared with VRChat Inc. or other third parties unless required by law.

## 4. Acceptable Use Policy

You agree **NOT** to use the Software to:

1.  Harass, stalk, or harm other users.
2.  Violate the Terms of Service of VRChat or any other platform.
3.  Reverse engineer, decompile, or modify the Software to bypass security features or license checks.
4.  Distribute modified or malicious versions of the Software.

## 5. Indemnification

You agree to indemnify, defend, and hold harmless the developers and administrators of Group Guard For VRChat from and against any and all claims, liabilities, damages, and costs (including legal fees) arising out of your use of the Software or your violation of these Terms.

## 6. Termination

We reserve the right to revoke your access to the Software at any time, for any reason, without notice. Reasons for termination may include, but are not limited to, violation of the Acceptable Use Policy, chargebacks, or attempts to bypass licensing restrictions.

## 7. Severability

If any provision of these Terms is found to be unenforceable or invalid, that provision will be limited or eliminated to the minimum extent necessary, so that these Terms will otherwise remain in full force and effect and enforceable.

## 8. Fees, Payments, and Refunds

### 8.1 Subscription and Payments
Access to certain features of the Software may require a one-time payment or a recurring subscription fee. By providing a payment method, you authorize us (or our third-party payment processor) to charge the designated fees.

### 8.2 Strict No-Refund Policy
* **Digital Goods:** Due to the digital nature of the Software and the immediate access granted upon purchase, **ALL SALES ARE FINAL**.
* **No Refunds for Bans:** You explicitly agree that **NO REFUNDS** will be issued if your VRChat account or any other third-party service account is restricted, suspended, or banned as a result of using the Software.
* **No Refunds for Termination:** No refunds will be granted if your access to the Software is revoked for violating these Terms of Service.

### 8.3 Chargebacks and Disputes
* **Dispute Resolution:** You agree to contact support to resolve any billing issues before initiating a chargeback with your bank or payment provider.
* **Consequences of Chargebacks:** Initiating a chargeback without first attempting to resolve the issue with us is considered a violation of these Terms and may result in the immediate and permanent termination of your access to the Software, as well as a permanent ban of your HWID and VRChat Identity from our services.

---

**BY CLICKING "I AGREE", YOU CONFIRM THAT YOU HAVE READ, UNDERSTOOD, AND AGREED TO THESE TERMS.**
`.trim();
