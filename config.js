// Deployed addresses. Empty string = not deployed yet (the page shows that state).
window.CONFIG = {
  chainId: 11155111,
  rpc: "https://ethereum-sepolia-rpc.publicnode.com",
  groupToken: "0xba07D78eF160Ce017FBDC4Bf3b2835ac3bcc91C6",
  farm: "0xA76DEf3427e4BBC696E9F7cCa5906b65a6595B00",
  pools: [
    { poolId: 0, pair: "0x7B9945a8D8ea4507A478F7eC84fFA7a71fF4b8df" }, // STCR / GROUP3 (Serhii)
    { poolId: 1, pair: "0x47198D03720cF8a28e87483AfcB7fb7b6258FeF8" }, // CAFE / GROUP3 (Serhii, 2nd token)
    { poolId: 2, pair: "0xb49465E7cbbd874C55C1b7139FC8D6CCb7b85e60" }, // SLV072 / GROUP3 (Dzoanna)
  ],
  router: "0xeE567Fe1712Faf6149d80dA1E6934E354124CfE3",
};
