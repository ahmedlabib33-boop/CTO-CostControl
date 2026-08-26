export type ExecutiveQuestion = {
  id: string;
  question: string;
  answer: string;
  plainEnglish: string;
  engOlla: string;
  managementChallenge?: string;
};

export type ExecutiveModule = {
  id: string;
  number: string;
  title: string;
  subtitle: string;
  description: string;
  questions: ExecutiveQuestion[];
  summary: {
    steps: { label: string; detail?: string }[];
    engOlla: string[];
    executiveNumbers?: string[];
  };
};

export const MAX_QUESTIONS_PER_PAGE = 3;

export const OLLA_MODULES: ExecutiveModule[] = [
  {
    id: "cash-flow",
    number: "01",
    title: "Contract Cash Flow & Financial Control",
    subtitle: "Can the project remain financially healthy while it is being executed?",
    description: "Understand how schedule, cost, payment timing, retention and financing combine to determine whether a profitable project can actually survive financially.",
    questions: [
      {
        id: "M1-Q01",
        question: "What is project cash flow?",
        answer: "Cash Flow = Income − Expense.\n\nPositive cash flow means the project has received more cash than it has paid at that point in time.\n\nNegative cash flow means the contractor must finance the difference.",
        plainEnglish: "Profit asks whether the project will make money overall.\n\nCash flow asks whether enough money is available at the right time to keep the project operating.\n\nA project can eventually make a profit and still suffer a severe cash shortage during execution.",
        engOlla: "A profitable project is not automatically a financially healthy project. Senior management must understand both the expected final profit and the timing of cash.",
        managementChallenge: "What is our worst negative cash position, when will it occur, how long will it last, and how will it be financed?",
      },
      {
        id: "M1-Q02",
        question: "What is the difference between cost and expense?",
        answer: "Cost is what the work economically costs.\n\nExpense is the actual cash payment after payment timing and credit periods are considered.",
        plainEnglish: "Materials may be consumed today but paid for later.\n\nEquipment may work this month but its invoice may be settled next month.\n\nTherefore: Cost timing and cash-out timing are not necessarily the same.",
        engOlla: "Whenever management receives a cost report, know whether it shows cost recognition or actual cash-out timing. They answer different management questions.",
      },
      {
        id: "M1-Q03",
        question: "What is the difference between direct and indirect cost?",
        answer: "Direct cost can be connected directly to specific project work, such as:\n• labor\n• materials\n• equipment\n• subcontractors\n\nIndirect cost supports the project or company but cannot conveniently be charged to one specific activity.\n\nExamples include:\n• project/site overhead\n• general/head-office overhead",
        plainEnglish: "Direct cost builds the work.\n\nIndirect cost keeps the organization and project environment operating.",
        engOlla: "A project can appear operationally successful while its margin is being consumed by indirect cost. A powerful management question is: What is our indirect-cost burn per month?",
      },
      {
        id: "M1-Q04",
        question: "What does an S-Curve tell management?",
        answer: "An S-Curve represents cumulative project expenditure over time.\n\nIt normally:\n• rises slowly during mobilization\n• becomes steeper during peak execution\n• flattens again as work finishes",
        plainEnglish: "The slope shows how quickly the project is consuming money.\n\nA steeper slope normally means faster expenditure.",
        engOlla: "Do not treat the S-Curve as only a presentation chart. Read its slope. Ask: Why is expenditure accelerating? Why has it unexpectedly flattened? Does the expected cash-in profile support this expenditure profile?",
      },
      {
        id: "M1-Q05",
        question: "What is the difference between revenue and income?",
        answer: "Revenue is the value earned from completed work.\n\nIncome is the actual cash received from the owner after retention and payment timing are considered.",
        plainEnglish: "The sequence may be:\n\nperform work → earn revenue → invoice → certify → wait → receive cash\n\nThese are not the same event.",
        engOlla: "Never confuse earned revenue, invoiced value, certified value and actual cash received. A large revenue number can create false comfort if collections are weak.",
        managementChallenge: "How much of our earned revenue has actually converted into cash?",
      },
      {
        id: "M1-Q06",
        question: "Why is retention important?",
        answer: "Retention is part of an interim payment temporarily withheld by the owner and released later according to the contract.",
        plainEnglish: "The contractor may have completed and earned the work, but part of the money remains unavailable.",
        engOlla: "Retention is working capital temporarily trapped inside the contract. It directly affects the contractor's financing requirement.",
        managementChallenge: "How much retention is outstanding?\nWhen is it contractually due for release?\nWhat conditions control its release?\nIs any amount overdue?\nHas the real release date been included in cash-flow forecasting?",
      },
      {
        id: "M1-Q07",
        question: "Why is an advance payment valuable?",
        answer: "An advance or mobilization payment brings cash into the project before normal progress-payment receipts and is later recovered according to the contract.",
        plainEnglish: "It gives the contractor funding earlier, when mobilization and early expenditure may be high.",
        engOlla: "Advance payment primarily improves timing and liquidity; it does not automatically increase profit. This distinction is fundamental: profit improvement ≠ cash-flow improvement.",
      },
      {
        id: "M1-Q08",
        question: "What is maximum overdraft?",
        answer: "Maximum overdraft is the deepest negative cash-flow position.\n\nIt represents the maximum amount the contractor may need to finance.\n\nIn the chapter's Example 8.3:\n• total project cost = LE 150,000\n• total revenue = LE 157,500\n• markup = 5%\n• retention = 10%\n• owner payment delayed one period\n• no advance payment\n\nThe maximum overdraft reaches LE 98,000 at approximately Day 16.",
        plainEnglish: "The project ultimately earns more revenue than cost, but before reaching that result the contractor must temporarily finance a very large portion of the project.",
        engOlla: "Final margin tells you whether the project makes money. The cash-flow curve tells you whether the company can survive long enough to reach that profit.",
      },
      {
        id: "M1-Q09",
        question: "Why does payment frequency matter?",
        answer: "Less frequent payments generally increase the financing gap because the contractor continues paying project expenses while waiting longer for owner receipts.",
        plainEnglish: "Doing several months of work before receiving payment can require much more financing than receiving progress payments more frequently.\n\nThe final contract revenue may be the same. The financing requirement may be completely different.",
        engOlla: "Payment terms are part of project economics, not harmless administrative wording. When comparing opportunities, consider payment frequency, certification delay, payment delay, retention and advance payment alongside margin.",
      },
      {
        id: "M1-Q10",
        question: "What are the main drivers of project cash flow?",
        answer: "Major drivers include:\n1. project schedule\n2. direct and indirect costs\n3. timing of contractor payments\n4. markup\n5. retention and retention release\n6. owner payment delay\n7. advance or mobilization payment",
        plainEnglish: "Cash flow is not produced by the finance department alone.\n\nIt is influenced by: Planning + Cost Control + Commercial + Procurement + Operations + Finance.",
        engOlla: "If the programme materially changes but the cash-flow forecast remains unchanged, challenge it. The same applies when procurement timing, payment terms or collection delays change.",
      },
      {
        id: "M1-Q11",
        question: "Can cash flow improve without increasing profit?",
        answer: "Yes.\n\nCash flow can improve through timing changes such as:\n• advance payment\n• faster collection\n• better payment timing\n• improved production\n• optimized material-delivery timing\n• retention negotiation\n\nwithout necessarily changing total project profit.",
        plainEnglish: "There are three different problems:\n\nProfit problem: we are not making enough money.\n\nCash problem: money is arriving too late.\n\nCost problem: we are spending too much.\n\nThey are related, but they are not the same problem.",
        engOlla: "Make sure the corrective action matches the actual problem. Do not solve a cash-timing problem using a cost-cutting action if the underlying economics do not require it.",
      },
      {
        id: "M1-Q12",
        question: "What is the cost of borrowing?",
        answer: "When project expenses exceed income, the contractor may need bank financing or company funds.\n\nThe chapter relates financing cost to the money-time exposure represented by the gap between expense and income.",
        plainEnglish: "The financing issue has two dimensions:\n\nHow much money is required?\n\nand\n\nFor how long is it required?",
        engOlla: "LE 10 million required for one month and LE 10 million required for twelve months are not the same financial exposure. Both the amount and duration of negative cash flow matter.",
      },
    ],
    summary: {
      steps: [
        { label: "SCHEDULE" }, { label: "WHEN WORK HAPPENS" }, { label: "WHEN COST IS INCURRED" },
        { label: "PAYMENT TERMS" }, { label: "WHEN EXPENSE OCCURS" }, { label: "PROGRESS" },
        { label: "REVENUE" }, { label: "RETENTION + OWNER DELAY" }, { label: "INCOME" },
        { label: "INCOME − EXPENSE" }, { label: "CASH FLOW" }, { label: "FINANCING REQUIREMENT" },
        { label: "FINANCIAL CHARGE" }, { label: "PROJECT PROFITABILITY" },
      ],
      engOlla: ["A schedule decision can become a finance decision, and a payment clause can become a profit decision."],
      executiveNumbers: ["Forecast Final Profit", "Current Cash Position", "Maximum Forecast Overdraft", "Date of Maximum Overdraft", "Receivables / Delayed Payment", "Retention Outstanding", "Financing Cost"],
    },
  },
  {
    id: "capital-allocation",
    number: "02",
    title: "Profitability, Capital Allocation, NPV & IRR",
    subtitle: "Is this project the best use of the company's capital?",
    description: "Move beyond nominal profit and understand how senior management compares capital exposure, time, present value and investment return.",
    questions: [
      {
        id: "M2-Q01",
        question: "What are the three basic profitability indicators?",
        answer: "The chapter identifies:\n• Profit\n• Maximum Capital\n• Payback Period",
        plainEnglish: "They answer three different questions:\n\nProfit: How much money does the project finally produce?\n\nMaximum Capital: How much money must be tied up at peak exposure?\n\nPayback: How quickly does the investment return?",
        engOlla: "Senior management should think about Return + Capital Exposure + Time together. Do not evaluate an opportunity using profit alone.",
      },
      {
        id: "M2-Q02",
        question: "Can one project be better and worse at the same time?",
        answer: "Yes.\n\nIn the chapter's comparison of Projects A and B:\n• Project A requires less maximum capital\n• Project A has the shorter payback\n• Project B has the higher final profit\n\nTherefore the ranking changes depending on which management criterion is used.",
        plainEnglish: "A project can generate more total profit but consume more capital and take longer to return that money.",
        engOlla: "The project with the highest profit is not automatically the most attractive investment.",
      },
      {
        id: "M2-Q03",
        question: "Why does maximum capital matter?",
        answer: "Maximum capital represents the greatest funding commitment required before sufficient cash has been recovered.",
        plainEnglish: "Capital committed to one project is temporarily unavailable for other business opportunities.",
        engOlla: "Every major project consumes capital capacity as well as management capacity. When reviewing expected profit, also ask: How much company money must remain committed to generate that profit?",
      },
      {
        id: "M2-Q04",
        question: "What is payback period?",
        answer: "Payback period is the time required for cumulative project cash flow to recover the initial investment and return to zero.\n\nShorter payback is preferred under this simple criterion.",
        plainEnglish: "It tells management how long it takes to get the invested money back.",
        engOlla: "Payback is fundamentally about how long company capital remains exposed before recovery.",
      },
      {
        id: "M2-Q05",
        question: "Why is money today worth more than the same amount later?",
        answer: "Money available today can be invested and earn a return.\n\nThe chapter demonstrates that LE100 invested at 10% becomes:\n• LE110 after one year\n• LE121 after two years",
        plainEnglish: "Receiving LE1 million today and receiving LE1 million several years from now are not economically equivalent.",
        engOlla: "Whenever someone presents a large future cash amount, ask one immediate question: When? Without timing, the number is incomplete.",
      },
      {
        id: "M2-Q06",
        question: "What is Present Value?",
        answer: "Present Value converts future money into today's equivalent value.\n\nPV = Future Cash / (1 + r)^n\n\nwhere:\n• r = discount rate\n• n = number of periods\n\nThe chapter gives the example that $100 received three years in the future has a present value of approximately $75.13 at a 10% annual discount rate.",
        plainEnglish: "Future cash is discounted backward.\n\nThe farther away the money is, or the higher the required rate, the less it is worth today.",
        engOlla: "Future revenue should never be treated as though it has exactly the same value as cash available today.",
      },
      {
        id: "M2-Q07",
        question: "What does the discount rate do?",
        answer: "The discount rate is the rate used to convert future cash flows into their present value.",
        plainEnglish: "A higher discount rate places less present value on cash expected far into the future.",
        engOlla: "Never accept an NPV number without asking what discount rate was used. The NPV result depends on this assumption.",
      },
      {
        id: "M2-Q08",
        question: "What is NPV?",
        answer: "NPV means Net Present Value.\n\nIt is the sum of the present values of project cash flows, where expenses are negative and income is positive.\n\nNPV > 0 → acceptable\n\nWhen comparing alternatives:\nlarger positive NPV → preferred",
        plainEnglish: "NPV asks: After considering when money enters and leaves the project, how much economic value does this investment create today?",
        engOlla: "Profit tells you nominal money made. NPV tells you value created after recognizing time.",
      },
      {
        id: "M2-Q09",
        question: "Can a project with larger future receipts have a lower NPV?",
        answer: "Yes.\n\nA project receiving cash later can have less present value than another project receiving cash earlier.\n\nIn the chapter's NPV comparison at a 10% discount rate, Project A is selected because it produces the larger NPV.",
        plainEnglish: "Timing can outweigh headline totals.",
        engOlla: "Look at when the money arrives, not merely how much eventually arrives.",
      },
      {
        id: "M2-Q10",
        question: "What is IRR?",
        answer: "IRR means Internal Rate of Return.\n\nIt is the discount rate at which:\nNPV = 0\n\nThe chapter's decision rule is:\nIRR > minimum required return → acceptable\n\nFor alternatives, the chapter prefers the higher IRR, provided it exceeds the minimum acceptable return.",
        plainEnglish: "IRR expresses the return embedded in the project's cash-flow pattern as a percentage.",
        engOlla: "An IRR percentage has little meaning until it is compared with the company's required return.",
      },
      {
        id: "M2-Q11",
        question: "What question should immediately follow “IRR = 14%”?",
        answer: "Ask: Against what required return?",
        plainEnglish: "If the company's required return is 10%, a 14% IRR passes that threshold.\n\nIf the required return is 18%, it does not.",
        engOlla: "Never approve an investment because an IRR number simply looks high. Compare it with the return the company requires from its capital.",
      },
      {
        id: "M2-Q12",
        question: "What does each executive investment metric actually answer?",
        answer: "Profit — How much nominal money will we make?\nMaximum Capital — How much funding must we commit at peak exposure?\nPayback — How quickly do we recover the investment?\nNPV — How much value is created today after considering timing?\nIRR — What rate of return is embedded in the project's cash flow?",
        plainEnglish: "These indicators are complementary.\n\nThey are not interchangeable.",
        engOlla: "Do not allow one attractive number to make the entire decision. A strong investment decision connects: Profit + Cash Requirement + Time + Present Value + Return.",
      },
    ],
    summary: {
      steps: [
        { label: "LEVEL 1 · PROFIT", detail: "Do we make money?" },
        { label: "LEVEL 2 · CASH FLOW", detail: "Can we financially survive while making it?" },
        { label: "LEVEL 3 · MAXIMUM CAPITAL", detail: "How much company money must we commit?" },
        { label: "LEVEL 4 · PAYBACK", detail: "How quickly do we recover that money?" },
        { label: "LEVEL 5 · PRESENT VALUE / NPV", detail: "What are the future cash flows actually worth today?" },
        { label: "LEVEL 6 · IRR", detail: "What return does the investment generate?" },
        { label: "LEVEL 7 · EXECUTIVE DECISION", detail: "Is this the best available use of our capital?" },
      ],
      engOlla: [
        "The biggest project is not automatically the best project.",
        "The highest revenue is not automatically the best project.",
        "The highest nominal profit is not automatically the best project.",
        "Top management must judge value relative to capital, timing and return.",
      ],
    },
  },
];
