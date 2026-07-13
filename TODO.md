# Throughline TODOs

## Flows
- [ ] Dropdown for Activities in Flow doesn't work
- [ ] Show alternative flows more inline
- [ ] Think about the formality of behavior — the ultimate goal is an executable model and generating state charts, and we're far from that today
  - e.g. add variables to components to express conditions such as `chamber.noVessels != 0` as the alternate path of UC-001

## Components
- [ ] Think about how to reduce duplication
  - e.g. signal lower reach, upper reach, both, permitted reach — the "both" or "permitted" options shouldn't need to exist since they're just the previous ones combined depending on conditions
- [ ] Don't like the current system structure graph layout — the columns imply a left-to-right order that doesn't actually exist
  - Also show hierarchy with the main system at the top and other components underneath
  - Implies needing two types of arcs to make the distinction
  - Consider rendering as a tree, and also as blocks nested inside each other (helps for UI development)
  - For things like UI development, it should be possible to create components directly inside the structure view, since that feels more natural

## Side Bar
- [ ] Improve side bar usability — e.g. in the component sidebar, clicking a tagged Use Case has no back button in the side panel, so I have to fully close it
- [ ] There is no UI for adding traces — it just says "traces to" but I can't add new traces there

## LLM Accessibility
- [ ] When a project is created, add instructions for LLMs (plus generic advice) into all the subfolders explaining how things work
- [ ] Add instructions for LLMs reverse engineering existing codebases
  - Perhaps use SugarVita as a large example of what happens (would cost a bunch of tokens)
- [ ] Come up with test cases for code generation and any LLM instructions that should be given — either by default or in a new view for the user

## Examples
- [ ] Think of more varied examples as proof of concepts
  - Perhaps something like web development, but unclear if it makes sense — how do you compete with something like Claude Design? Think more about how to approach this
