// Cut from the design screenshots with their flat backgrounds removed, so panels can follow the theme.
// Aspect ratios are width / height of the source PNGs.
export const illustrations = {
  team: { source: require('@/assets/images/illustrations/onboarding-team.png'), ratio: 912 / 952 },
  friends: { source: require('@/assets/images/illustrations/home-friends.png'), ratio: 845 / 665 },
  crew: { source: require('@/assets/images/illustrations/new-group-crew.png'), ratio: 912 / 514 },
  squad: { source: require('@/assets/images/illustrations/edit-group-crew.png'), ratio: 912 / 378 },
} as const;
