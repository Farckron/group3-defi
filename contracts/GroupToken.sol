// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// Group reward token. 100,000,000 minted once to the deployer; no owner, no mint, no fees.
contract GroupToken is ERC20 {
    constructor() ERC20("Group 3 Token", "GROUP3") {
        _mint(msg.sender, 100_000_000 * 10 ** decimals());
    }
}
